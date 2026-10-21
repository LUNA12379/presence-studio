using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class Data {
    public static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    public static Dictionary<string, object> Obj(object value) { return value as Dictionary<string, object> ?? new Dictionary<string, object>(); }
    public static object Get(Dictionary<string, object> d, string k) { object v; return d.TryGetValue(k, out v) ? v : null; }
    public static string Str(Dictionary<string, object> d, string k, string fallback = "") { var v = Get(d, k); return v == null ? fallback : Convert.ToString(v); }
    public static bool Bool(Dictionary<string, object> d, string k, bool fallback = false) { var v = Get(d, k); return v is bool ? (bool)v : fallback; }
    public static double Num(Dictionary<string, object> d, string k, double fallback = 0) { double result; return double.TryParse(Str(d, k), out result) ? result : fallback; }
    public static long Now { get { return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds; } }
}
static class Native {
    [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")] public static extern bool ReleaseCapture();
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, int message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint key, byte alpha, uint flags);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
}
static class Program {
    public static readonly string Root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
    public static readonly string Address = "http://127.0.0.1:49832";
    public static readonly string DataDirectory = String.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("PRESENCE_STUDIO_DATA_DIR")) ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PresenceStudio") : Path.GetFullPath(Environment.GetEnvironmentVariable("PRESENCE_STUDIO_DATA_DIR"));
    public static string SettingsFile { get { string current = Path.Combine(DataDirectory, "config.json"); return File.Exists(current) ? current : Path.Combine(Root, "config.json"); } }
    public static string InstanceKey;
    public static EventWaitHandle ShowEvent;
    [STAThread] static void Main(string[] args) {
        Native.SetProcessDPIAware(); Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        using (var sha = SHA256.Create()) InstanceKey = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Root.ToLowerInvariant()))).Replace("-", "").Substring(0, 16);
        string verify = null; bool background = false;
        foreach (string arg in args) { if (arg.StartsWith("--verify=")) verify = arg.Substring(9); if (arg == "--background") background = true; }
        bool created;
        using (var mutex = new Mutex(true, "Local\\PresenceStudio-" + InstanceKey + (verify == null ? "" : "-verify"), out created)) {
            if (!created) { try { using (var ev = EventWaitHandle.OpenExisting("Local\\PresenceStudioShow-" + InstanceKey)) ev.Set(); } catch {} return; }
            if (verify == null) ShowEvent = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\PresenceStudioShow-" + InstanceKey);
            try { Application.Run(new StudioForm(background, verify)); }
            catch (Exception error) { MessageBox.Show(error.Message, "Presence Studio", MessageBoxButtons.OK, MessageBoxIcon.Error); }
            finally { if (ShowEvent != null) ShowEvent.Dispose(); }
        }
    }
}
sealed class StudioForm : Form {
    readonly WebView2 view = new WebView2();
    readonly HttpClient http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
    readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = 1000 };
    readonly bool background; readonly string verifyPath;
    NotifyIcon tray; OverlayForm overlay; bool busy, exiting, hotkey, overlayHotkey; string token; int failedPolls;
    Dictionary<string, object> state = new Dictionary<string, object>();
    CoreWebView2DownloadOperation verificationDownload;
    public StudioForm(bool background, string verifyPath) {
        this.background = background; this.verifyPath = verifyPath;
        Text = "Presence Studio"; Width = 1180; Height = 850; MinimumSize = new Size(900, 680);
        StartPosition = FormStartPosition.CenterScreen; BackColor = Color.FromArgb(13, 16, 24);
        string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "studio.ico"); if (File.Exists(iconPath)) Icon = new Icon(iconPath);
        view.Dock = DockStyle.Fill; view.DefaultBackgroundColor = BackColor; Controls.Add(view);
        Shown += async delegate { await Initialize(); };
        FormClosing += delegate(object sender, FormClosingEventArgs e) {
            if (!exiting && verifyPath == null && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); }
        };
        timer.Tick += async delegate { if (Program.ShowEvent != null && Program.ShowEvent.WaitOne(0)) ShowStudio(); await Poll(); };
    }
    async Task EnsureServer() {
        try { string health = await http.GetStringAsync(Program.Address + "/api/health"); if (health.Contains("2.8.2")) return;
            // Upgrade only this application's v1 bridge, preserving its pairing key.
            if (health.Contains("youtube-discord-local")) {
                var old = Data.Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(Program.SettingsFile));
                using (var request = new HttpRequestMessage(HttpMethod.Post, Program.Address + "/api/stop")) {
                    request.Headers.Add("X-Bridge-Token", Data.Str(old, "token")); request.Content = new StringContent("{}", Encoding.UTF8, "application/json");
                    await http.SendAsync(request);
                }
                await Task.Delay(600);
            }
        } catch (HttpRequestException) {} catch (TaskCanceledException) {}
        string bundledNode = Path.Combine(Program.Root, "runtime", "node.exe");
        var info = new ProcessStartInfo(File.Exists(bundledNode) ? bundledNode : "node.exe", "\"" + Path.Combine(Program.Root, "server.mjs") + "\"") { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, WorkingDirectory = Program.Root };
        Process.Start(info);
        for (int i = 0; i < 35; i++) { await Task.Delay(250); try { string health = await http.GetStringAsync(Program.Address + "/api/health"); if (health.Contains("2.8.2")) return; } catch {} }
        throw new Exception(Locale.T("연결 프로그램을 시작하지 못했습니다. Node.js가 설치되어 있는지 확인하세요."));
    }
    async Task Initialize() {
        try {
            int dark = 1; try { Native.DwmSetWindowAttribute(Handle, 20, ref dark, 4); } catch {}
            Locale.ReadSettings(Program.SettingsFile);
            await EnsureServer();
            var config = Data.Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(Program.SettingsFile));
            token = Data.Str(config, "token"); Locale.Language = Data.Str(config, "language", "ko");
            var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Path.GetTempPath(), "PresenceStudioWebView", Program.InstanceKey));
            await view.EnsureCoreWebView2Async(environment);
            if (verifyPath != null && Environment.GetEnvironmentVariable("PRESENCE_STUDIO_VERIFY_MUTATIONS") == "1" && !String.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("PRESENCE_STUDIO_DATA_DIR"))) {
                // Deterministic images for the isolated verifier's two synthetic Discord assets.
                string fixtureBase = "https://cdn.discordapp.com/app-assets/123456789012345678/";
                foreach (string asset in new[] { "234567890123456789", "234567890123456790" }) view.CoreWebView2.AddWebResourceRequestedFilter(fixtureBase + asset + ".png", CoreWebView2WebResourceContext.Image);
                view.CoreWebView2.WebResourceRequested += delegate(object sender, CoreWebView2WebResourceRequestedEventArgs e) {
                    bool second = e.Request.Uri == fixtureBase + "234567890123456790.png";
                    if (!second && e.Request.Uri != fixtureBase + "234567890123456789.png") return;
                    var imageBytes = new MemoryStream();
                    using (var bitmap = new Bitmap(96,96)) using (var graphics = Graphics.FromImage(bitmap)) using (var font = new Font("Segoe UI",24,FontStyle.Bold)) {
                        graphics.Clear(second ? Color.DarkOrange : Color.CornflowerBlue); graphics.DrawString(second ? "D2" : "D1",font,Brushes.White,14,26); bitmap.Save(imageBytes,ImageFormat.Png);
                    }
                    imageBytes.Position=0;e.Response=environment.CreateWebResourceResponse(imageBytes,200,"OK","Content-Type: image/png\r\nCache-Control: no-store");
                };
            }
            view.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            view.CoreWebView2.Settings.IsStatusBarEnabled = false;
            view.CoreWebView2.Settings.AreDevToolsEnabled = false;
            view.CoreWebView2.DownloadStarting += SaveImageDownload;
            view.CoreWebView2.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs e) { e.Handled = true; OpenExternal(e.Uri); };
            view.CoreWebView2.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs e) {
                Uri uri; if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out uri) || uri.Scheme != "http" || uri.Host != "127.0.0.1" || uri.Port != 49832) { e.Cancel = true; OpenExternal(e.Uri); }
            };
            view.CoreWebView2.WebMessageReceived += async delegate(object sender, CoreWebView2WebMessageReceivedEventArgs e) {
                if (!e.Source.StartsWith(Program.Address + "/", StringComparison.Ordinal)) return;
                string command; try { command = e.TryGetWebMessageAsString(); } catch { return; }
                if (command == "hide") Hide();
                if (command == "quit") await Quit();
            };
            if (verifyPath == null) SetupTray();
            overlay = new OverlayForm(async point => { await Api("config", new { overlay = new { x = point.X, y = point.Y } }); }, ShowStudio);
            view.CoreWebView2.Navigate(Program.Address + "/");
            if (verifyPath == null) {
                hotkey = Native.RegisterHotKey(Handle, 1, 0x4000 | 2 | 4, (uint)Keys.P);
                overlayHotkey = Native.RegisterHotKey(Handle, 2, 0x4000 | 2 | 4, (uint)Keys.O);
                timer.Start(); await Poll(); if (background) Hide();
            } else { await Verify(); }
        } catch (Exception error) {
            if (verifyPath != null) { Directory.CreateDirectory(verifyPath); File.WriteAllText(Path.Combine(verifyPath, "error.txt"), error.ToString()); }
            else MessageBox.Show(error.Message, "Presence Studio", MessageBoxButtons.OK, MessageBoxIcon.Error);
            exiting = true; Close();
        }
    }
    void OpenExternal(string value) { Uri uri; if (Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.Scheme == "https") Process.Start(new ProcessStartInfo(value) { UseShellExecute = true }); }
    void SetupTray() {
        var menu = new ContextMenuStrip();
        menu.Items.Add(Locale.T("Presence Studio 열기"), null, delegate { ShowStudio(); });
        menu.Items.Add(Locale.T("활동 표시 켜기 / 끄기  ·  Ctrl+Shift+P"), null, async delegate { await TogglePresence(); });
        menu.Items.Add(Locale.T("오버레이 켜기 / 끄기  ·  Ctrl+Shift+O"), null, async delegate { await ToggleOverlay(); });
        menu.Items.Add(Locale.T("자동 감지로 전환"), null, async delegate { await Change(new { sourceMode = "auto" }); });
        menu.Items.Add(new ToolStripSeparator()); menu.Items.Add(Locale.T("종료"), null, async delegate { await Quit(); });
        tray = new NotifyIcon { Icon = Icon, Text = "Presence Studio", Visible = true, ContextMenuStrip = menu };
        tray.DoubleClick += delegate { ShowStudio(); };
        menu.Opening += delegate { RefreshTrayLanguage(); };
    }
    void RefreshTrayLanguage() {
        if (tray == null) return;
        string[] labels = {"Presence Studio 열기", "활동 표시 켜기 / 끄기  ·  Ctrl+Shift+P", "오버레이 켜기 / 끄기  ·  Ctrl+Shift+O", "자동 감지로 전환", "", "종료"};
        for (int i = 0; i < labels.Length; i++) if (labels[i] != "") tray.ContextMenuStrip.Items[i].Text = Locale.T(labels[i]);
    }
    public void ShowStudio() { Show(); if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal; Activate(); }
    async Task<Dictionary<string, object>> Api(string endpoint, object body = null) {
        using (var request = new HttpRequestMessage(body == null ? HttpMethod.Get : HttpMethod.Post, Program.Address + "/api/" + endpoint)) {
            request.Headers.Add("X-Bridge-Token", token);
            if (body != null) request.Content = new StringContent(Data.Json.Serialize(body), Encoding.UTF8, "application/json");
            using (var response = await http.SendAsync(request)) {
                string result = await response.Content.ReadAsStringAsync(); response.EnsureSuccessStatusCode();
                return Data.Json.Deserialize<Dictionary<string, object>>(result);
            }
        }
    }
    async Task Poll() {
        if (busy || exiting || token == null) return; busy = true;
        try {
            state = await Api("native/state", new { hotkeyRegistered = hotkey, overlayHotkeyRegistered = overlayHotkey });
            failedPolls = 0;
            var config = Data.Obj(Data.Get(state, "config")); var style = Data.Obj(Data.Get(config, "overlay"));
            Locale.Language = Data.Str(config, "language", "ko"); RefreshTrayLanguage();
            overlay.UpdateState(Data.Obj(Data.Get(state, "display")), style, Data.Bool(config, "enabled"));
        } catch { if (overlay != null) overlay.Hide(); if (++failedPolls >= 5) { exiting = true; Close(); } }
        finally { busy = false; }
    }
    async Task Change(object patch) { try { await Api("config", patch); await Poll(); } catch (Exception error) { if (tray != null) tray.ShowBalloonTip(3000, "Presence Studio", error.Message, ToolTipIcon.Warning); } }
    async Task TogglePresence() { await Change(new { enabled = !Data.Bool(Data.Obj(Data.Get(state, "config")), "enabled", true) }); }
    void SaveImageDownload(object sender, CoreWebView2DownloadStartingEventArgs e) {
        Uri uri;
        if (!Uri.TryCreate(e.DownloadOperation.Uri, UriKind.Absolute, out uri) || uri.Scheme != "http" || uri.Host != "127.0.0.1" || uri.Port != 49832 || !System.Text.RegularExpressions.Regex.IsMatch(uri.AbsolutePath, "^/media/[a-f0-9]{64}$")) { e.Cancel = true; return; }
        e.Handled = true;
        var deferral = e.GetDeferral();
        // Show the native save dialog after the WebView2 event returns to avoid re-entrancy.
        BeginInvoke(new Action(delegate {
            try {
                if (verifyPath != null && Environment.GetEnvironmentVariable("PRESENCE_STUDIO_VERIFY_MUTATIONS") == "1" && !String.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("PRESENCE_STUDIO_DATA_DIR"))) {
                    e.ResultFilePath = Path.Combine(verifyPath, "exported-image.png"); verificationDownload = e.DownloadOperation;
                } else {
                    using (var dialog = new SaveFileDialog { Title = Locale.T("Discord에 올릴 PNG 저장"), Filter = Locale.T("PNG 이미지 (*.png)|*.png"), FileName = Path.GetFileName(e.ResultFilePath), DefaultExt = "png", AddExtension = true, OverwritePrompt = true }) {
                        if (dialog.ShowDialog(this) == DialogResult.OK) e.ResultFilePath = dialog.FileName; else e.Cancel = true;
                    }
                }
            } finally { deferral.Complete(); }
        }));
    }
    async Task ToggleOverlay() { var style = Data.Obj(Data.Get(Data.Obj(Data.Get(state, "config")), "overlay")); await Change(new { overlay = new { enabled = !Data.Bool(style, "enabled") } }); }
    async Task Quit() { if (exiting) return; exiting = true; timer.Stop(); try { await Api("stop", new {}); } catch {} Close(); }
    async Task Verify() {
        Directory.CreateDirectory(verifyPath);
        await Task.Delay(2200);
        if (await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('#guideDialog').open") == "true") {
            using (var stream = File.Create(Path.Combine(verifyPath, "startup-guide.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
        }
        bool localImageVerified = false;
        if (Environment.GetEnvironmentVariable("PRESENCE_STUDIO_VERIFY_MUTATIONS") == "1" && !String.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("PRESENCE_STUDIO_DATA_DIR"))) {
            await view.CoreWebView2.ExecuteScriptAsync("window.studioCaptureCrop=true");
            await view.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(Path.Combine(Program.Root, "test", "ui-workflow.js")));
            bool finished = false;
            for (int i = 0; i < 100; i++) {
                await Task.Delay(150);
                if (await view.CoreWebView2.ExecuteScriptAsync("window.studioCropReady && !window.studioCropCaptured") == "true") {
                    using (var stream = File.Create(Path.Combine(verifyPath, "crop-editor.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
                    await view.CoreWebView2.ExecuteScriptAsync("window.studioCropCaptured=true");
                }
                if (await view.CoreWebView2.ExecuteScriptAsync("window.studioVerification && window.studioVerification.done === true") == "true") { finished = true; break; }
            }
            if (!finished) throw new Exception("Image / preset / guide UI workflow timed out");
            if (await view.CoreWebView2.ExecuteScriptAsync("!!window.studioVerification.error") == "true") throw new Exception(await view.CoreWebView2.ExecuteScriptAsync("window.studioVerification.error"));
            File.WriteAllText(Path.Combine(verifyPath, "workflow.json"), await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.studioVerification)"));
            await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('#exportImage').click()");
            for (int i = 0; i < 50; i++) { await Task.Delay(100); if (verificationDownload != null && verificationDownload.State == CoreWebView2DownloadState.Completed) break; }
            if (verificationDownload == null || verificationDownload.State != CoreWebView2DownloadState.Completed) throw new Exception("PNG export did not complete");
            using (var exported = new Bitmap(Path.Combine(verifyPath, "exported-image.png"))) {
                if (exported.Width != 1024 || exported.Height != 1024) throw new Exception("Exported image is not 1024 square");
            }
            await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('#imageDrop').scrollIntoView({block:'center'})"); await Task.Delay(200);
            using (var stream = File.Create(Path.Combine(verifyPath, "custom-images.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
            await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('#discordImageHelp').scrollIntoView({block:'center'})"); await Task.Delay(200);
            using (var stream = File.Create(Path.Combine(verifyPath, "discord-images.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
            await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('#presetControls').scrollIntoView({block:'center'})"); await Task.Delay(200);
            using (var stream = File.Create(Path.Combine(verifyPath, "preset-editor.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
            for (int step = 1; step <= 4; step++) {
                await view.CoreWebView2.ExecuteScriptAsync("showGuide(" + step + ");document.querySelector('#guideDialog').scrollTop=0"); await Task.Delay(200);
                using (var stream = File.Create(Path.Combine(verifyPath, "guide-step-" + (step + 1) + ".png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
                await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('#guideDialog').close()");
            }
            var imageState = await Api("status");
            var imageStyle = Data.Obj(Data.Get(Data.Obj(Data.Get(imageState, "config")), "overlay")); imageStyle["enabled"] = true;
            overlay.UpdateState(Data.Obj(Data.Get(imageState, "display")), imageStyle, true); await Task.Delay(900);
            localImageVerified = overlay.HasImage; if (!localImageVerified) throw new Exception("Native overlay did not load the saved image");
            using (var bitmap = new Bitmap(overlay.Width, overlay.Height)) { overlay.DrawToBitmap(bitmap, new Rectangle(Point.Empty, overlay.Size)); bitmap.Save(Path.Combine(verifyPath, "local-image-overlay.png"), ImageFormat.Png); }
            await view.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(Path.Combine(Program.Root,"test","ui-preview-workflow.js")));
            bool previewFinished=false;
            for(int i=0;i<160;i++) {
                await Task.Delay(150);
                string capture=Data.Json.Deserialize<string>(await view.CoreWebView2.ExecuteScriptAsync("window.studioPreviewCapture || null"));
                if(capture=="preset-preview-discord-ko"||capture=="preset-preview-discord-en"||capture=="preset-preview-local-ko") {
                    using(var stream=File.Create(Path.Combine(verifyPath,capture+".png")))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
                    await view.CoreWebView2.ExecuteScriptAsync("window.studioPreviewCapture=null");
                }
                if(await view.CoreWebView2.ExecuteScriptAsync("window.studioPreviewVerification && window.studioPreviewVerification.done")=="true"){previewFinished=true;break;}
            }
            if(!previewFinished||await view.CoreWebView2.ExecuteScriptAsync("!!window.studioPreviewVerification.error")=="true")throw new Exception(await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.studioPreviewVerification)"));
            File.WriteAllText(Path.Combine(verifyPath,"preview.json"),await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.studioPreviewVerification)"));
            await view.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(Path.Combine(Program.Root, "test", "ui-updates-workflow.js")));
            bool updateFinished=false;
            for(int i=0;i<100;i++){await Task.Delay(150);if(await view.CoreWebView2.ExecuteScriptAsync("window.studioUpdateVerification && window.studioUpdateVerification.done") == "true"){updateFinished=true;break;}}
            if(!updateFinished || await view.CoreWebView2.ExecuteScriptAsync("!!window.studioUpdateVerification.error") == "true")throw new Exception(await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.studioUpdateVerification)"));
            File.WriteAllText(Path.Combine(verifyPath,"updates.json"),await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.studioUpdateVerification)"));
            using(var stream=File.Create(Path.Combine(verifyPath,"updates.png")))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
            await view.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(Path.Combine(Program.Root,"test","ui-extension-workflow.js")));
            bool extensionsFinished=false;
            for(int i=0;i<120;i++) {
                await Task.Delay(150);
                string capture=Data.Json.Deserialize<string>(await view.CoreWebView2.ExecuteScriptAsync("window.studioExtensionCapture || null"));
                if(capture=="extensions-en"||capture=="extensions-ko") {
                    using(var stream=File.Create(Path.Combine(verifyPath,capture+".png")))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
                    await view.CoreWebView2.ExecuteScriptAsync("window.studioExtensionCapture=null");
                }
                if(await view.CoreWebView2.ExecuteScriptAsync("window.studioExtensionVerification && window.studioExtensionVerification.done")=="true"){extensionsFinished=true;break;}
            }
            if(!extensionsFinished||await view.CoreWebView2.ExecuteScriptAsync("!!window.studioExtensionVerification.error")=="true")throw new Exception(await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.studioExtensionVerification)"));
            File.WriteAllText(Path.Combine(verifyPath,"extensions.json"),await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.studioExtensionVerification)"));
            await view.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(Path.Combine(Program.Root,"extension","soundcloud-reader.js")));
            await view.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(Path.Combine(Program.Root,"test","ui-soundcloud-workflow.js")));
            bool soundcloudFinished=false;
            for(int i=0;i<120;i++) {
                await Task.Delay(150);
                if(await view.CoreWebView2.ExecuteScriptAsync("window.studioSoundCloudCapture === true")=="true") {
                    using(var stream=File.Create(Path.Combine(verifyPath,"soundcloud.png")))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
                    await view.CoreWebView2.ExecuteScriptAsync("window.studioSoundCloudCapture=false");
                }
                if(await view.CoreWebView2.ExecuteScriptAsync("window.studioSoundCloudVerification && window.studioSoundCloudVerification.done")=="true"){soundcloudFinished=true;break;}
            }
            if(!soundcloudFinished||await view.CoreWebView2.ExecuteScriptAsync("!!window.studioSoundCloudVerification.error")=="true")throw new Exception(await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.studioSoundCloudVerification)"));
            File.WriteAllText(Path.Combine(verifyPath,"soundcloud.json"),await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.studioSoundCloudVerification)"));
            await view.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(Path.Combine(Program.Root,"test","ui-browser-workflow.js")));
            bool browsersFinished=false;
            for(int i=0;i<120;i++) {
                await Task.Delay(150);
                string capture=Data.Json.Deserialize<string>(await view.CoreWebView2.ExecuteScriptAsync("window.studioBrowserCapture || null"));
                if(capture=="browsers-en"||capture=="browsers-ko") {
                    using(var stream=File.Create(Path.Combine(verifyPath,capture+".png")))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
                    await view.CoreWebView2.ExecuteScriptAsync("window.studioBrowserCapture=null");
                }
                if(await view.CoreWebView2.ExecuteScriptAsync("window.studioBrowserVerification && window.studioBrowserVerification.done")=="true"){browsersFinished=true;break;}
            }
            if(!browsersFinished||await view.CoreWebView2.ExecuteScriptAsync("!!window.studioBrowserVerification.error")=="true")throw new Exception(await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.studioBrowserVerification)"));
            File.WriteAllText(Path.Combine(verifyPath,"browsers.json"),await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.studioBrowserVerification)"));
            await view.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(Path.Combine(Program.Root,"test","ui-locale-workflow.js")));
            bool localeFinished=false;
            for(int i=0;i<160;i++) {
                await Task.Delay(150);
                string capture=Data.Json.Deserialize<string>(await view.CoreWebView2.ExecuteScriptAsync("window.studioLocaleCapture || null"));
                if(capture=="custom-en"||capture=="dashboard-en"||capture=="settings-en"||capture=="settings-ko"||capture=="guide-en"||capture=="crop-en") {
                    using(var stream=File.Create(Path.Combine(verifyPath,capture+".png")))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
                    await view.CoreWebView2.ExecuteScriptAsync("window.studioLocaleCapture=null");
                }
                if(await view.CoreWebView2.ExecuteScriptAsync("window.studioLocaleVerification && window.studioLocaleVerification.done")=="true"){localeFinished=true;break;}
            }
            if(!localeFinished||await view.CoreWebView2.ExecuteScriptAsync("!!window.studioLocaleVerification.error")=="true")throw new Exception(await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.studioLocaleVerification)"));
            File.WriteAllText(Path.Combine(verifyPath,"language.json"),await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify(window.studioLocaleVerification)"));
            view.CoreWebView2.Reload();await Task.Delay(2200);
            if(await view.CoreWebView2.ExecuteScriptAsync("document.documentElement.lang==='en' && latest.config.language==='en' && document.querySelector('#savePreset').textContent.includes('Save as preset')")!="true")throw new Exception("Language did not survive a full page reload");
            File.WriteAllText(Path.Combine(verifyPath,"language-reload.txt"),"English persisted across a full page reload");
            if(await view.CoreWebView2.ExecuteScriptAsync("latest.config.soundcloudApplicationId==='345678901234567890' && document.querySelector('#soundcloudApplicationId').value==='345678901234567890'")!="true")throw new Exception("SoundCloud ID did not survive a full page reload");
            Locale.ReadSettings(Program.SettingsFile);
        }
        await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('#guideDialog').close();document.querySelector('[data-panel=home]').click()");
        string result = await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify({title:document.title,ready:!!document.querySelector('#sourceMode'),text:document.body.innerText.slice(0,3500)})");
        File.WriteAllText(Path.Combine(verifyPath, "ui.json"), result);
        using (var stream = File.Create(Path.Combine(verifyPath, "dashboard.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
        await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-panel=custom]').click();document.querySelector('#manualTitle').value='집중하는 중 · 나만의 작업';document.querySelector('#manualState').value='음악과 함께 코딩하기';document.querySelector('#manualTitle').dispatchEvent(new Event('input',{bubbles:true}));");
        await Task.Delay(300);
        string customCheck = await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('#manualPreviewTitle').textContent === '집중하는 중 · 나만의 작업'");
        if (customCheck != "true") throw new Exception("Manual editor preview did not update");
        using (var stream = File.Create(Path.Combine(verifyPath, "custom-editor.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
        await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-panel=overlay]').click()"); await Task.Delay(1000);
        using (var stream = File.Create(Path.Combine(verifyPath, "settings-overlay.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
        await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-panel=presets]').click()"); await Task.Delay(200);
        using (var stream = File.Create(Path.Combine(verifyPath, "presets.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
        await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-panel=settings]').click()"); await Task.Delay(200);
        string identityCheck = await view.CoreWebView2.ExecuteScriptAsync("!!document.querySelector('#identityForm #applicationId[required]') && !!document.querySelector('#identityForm #saveApplicationId') && !document.querySelector('#settingsForm #applicationId')");
        if (identityCheck != "true") throw new Exception("Dedicated Application ID settings are missing");
        using (var stream = File.Create(Path.Combine(verifyPath, "connections.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
        var sample = Data.Json.Deserialize<Dictionary<string, object>>("{\"title\":\"좋아하는 음악과 함께\",\"subtitle\":\"Presence Studio · 오버레이 미리보기\",\"type\":2,\"source\":\"manual\",\"position\":42,\"duration\":180,\"timer\":\"media\",\"paused\":true}");
        var style = Data.Json.Deserialize<Dictionary<string, object>>("{\"enabled\":true,\"theme\":\"midnight\",\"width\":400,\"opacity\":95,\"accent\":\"#a8b5ff\",\"showImage\":true,\"showProgress\":true}");
        overlay.UpdateState(sample, style, true);
        using (var bitmap = new Bitmap(overlay.Width, overlay.Height)) { overlay.DrawToBitmap(bitmap, new Rectangle(Point.Empty, overlay.Size)); bitmap.Save(Path.Combine(verifyPath, "native-overlay.png"), ImageFormat.Png); }
        style["clickThrough"] = true; overlay.UpdateState(sample, style, true);
        bool passesClicks = (Native.GetWindowLong(overlay.Handle, -20) & 0x20) != 0;
        style["clickThrough"] = false; style["theme"] = "compact"; overlay.UpdateState(sample, style, true);
        bool restoredMouse = (Native.GetWindowLong(overlay.Handle, -20) & 0x20) == 0;
        File.WriteAllText(Path.Combine(verifyPath, "native.json"), Data.Json.Serialize(new { overlayWidth = overlay.Width, overlayHeight = overlay.Height, overlayVisible = overlay.Visible, passesClicks = passesClicks, restoredMouse = restoredMouse, customPreviewUpdated = customCheck == "true", localImageVerified = localImageVerified }));
        exiting = true; Close();
    }
    protected override void WndProc(ref Message message) {
        if (message.Msg == 0x0312) { if (message.WParam.ToInt32() == 1) { var task = TogglePresence(); } if (message.WParam.ToInt32() == 2) { var task = ToggleOverlay(); } }
        base.WndProc(ref message);
    }
    protected override void Dispose(bool disposing) {
        if (disposing) { timer.Stop(); timer.Dispose(); Native.UnregisterHotKey(Handle, 1); Native.UnregisterHotKey(Handle, 2); if (tray != null) { tray.Visible = false; tray.Dispose(); } if (overlay != null) overlay.Dispose(); http.Dispose(); }
        base.Dispose(disposing);
    }
}
sealed class OverlayForm : Form {
    readonly Func<Point, Task> savePosition; readonly Action showStudio;
    readonly HttpClient images = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
    Dictionary<string, object> data = new Dictionary<string, object>(), style = new Dictionary<string, object>();
    Image thumbnail; string imageUrl = ""; bool dragging, through; double lastX = double.NaN, lastY = double.NaN;
    public bool HasImage { get { return thumbnail != null; } }
    public OverlayForm(Func<Point, Task> savePosition, Action showStudio) {
        this.savePosition = savePosition; this.showStudio = showStudio;
        FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true;
        StartPosition = FormStartPosition.Manual; DoubleBuffered = true; BackColor = Color.FromArgb(21, 26, 40);
        Text = "Presence Studio Overlay"; ClientSize = new Size(400, 148);
    }
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams { get { var p = base.CreateParams; p.ExStyle |= 0x08000000 | 0x80; return p; } }
    public void UpdateState(Dictionary<string, object> data, Dictionary<string, object> style, bool enabled) {
        this.data = data; this.style = style;
        int width = (int)Data.Num(style, "width", 400), height = Data.Str(style, "theme") == "compact" ? 96 : 148;
        if (ClientSize != new Size(width, height)) ClientSize = new Size(width, height);
        bool light = Data.Str(style, "theme") == "light"; BackColor = light ? Color.FromArgb(247, 248, 252) : Color.FromArgb(21, 26, 40);
        Opacity = Math.Max(.25, Math.Min(1, Data.Num(style, "opacity", 95) / 100));
        double x = Data.Num(style, "x", double.NaN), y = Data.Num(style, "y", double.NaN);
        if (!dragging && (!x.Equals(lastX) || !y.Equals(lastY) || !Visible)) {
            var area = Screen.PrimaryScreen.WorkingArea;
            Point location = double.IsNaN(x) || double.IsNaN(y) ? new Point(area.Right - Width - 24, area.Bottom - Height - 24) : new Point((int)x, (int)y);
            var bounds = new Rectangle(location, Size); bool reachable = false;
            foreach (Screen screen in Screen.AllScreens) { var intersection = Rectangle.Intersect(screen.WorkingArea, bounds); if (intersection.Width >= 80 && intersection.Height >= 40) reachable = true; }
            if (!reachable) location = new Point(area.Right - Width - 24, area.Bottom - Height - 24);
            Location = location; lastX = x; lastY = y;
        }
        bool clickThrough = Data.Bool(style, "clickThrough");
        if (through != clickThrough || !IsHandleCreated) {
            through = clickThrough;
            int ex = Native.GetWindowLong(Handle, -20);
            Native.SetWindowLong(Handle, -20, through ? ex | 0x20 | 0x80000 : ex & ~0x20);
            if (through) Native.SetLayeredWindowAttributes(Handle, 0, (byte)(Opacity * 255), 2);
        }
        using (var curve = Rounded(new Rectangle(0, 0, Width, Height), 18)) { var old = Region; Region = new Region(curve); if (old != null) old.Dispose(); }
        string nextImage = Data.Str(data, "image"); if (nextImage != imageUrl) { imageUrl = nextImage; var ignored = LoadImage(nextImage); }
        if (enabled && Data.Bool(style, "enabled") && (data.Count > 0 || !Data.Bool(style, "hideWhenIdle", true))) { if (!Visible) Show(); } else Hide();
        Invalidate();
    }
    async Task LoadImage(string url) {
        Image next = null;
        try {
            Uri uri; if (Uri.TryCreate(url, UriKind.Absolute, out uri) && (uri.Scheme == "https" || (uri.Scheme == "http" && uri.Host == "127.0.0.1" && uri.Port == 49832 && uri.AbsolutePath.StartsWith("/media/")))) {
                using (var response = await images.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead)) {
                    response.EnsureSuccessStatusCode();
                    if (response.Content.Headers.ContentLength.GetValueOrDefault() > 5 * 1024 * 1024) throw new Exception();
                    using (var input = await response.Content.ReadAsStreamAsync()) using (var output = new MemoryStream()) {
                        byte[] buffer = new byte[16384]; int count;
                        while ((count = await input.ReadAsync(buffer, 0, buffer.Length)) > 0) { if (output.Length + count > 5 * 1024 * 1024) throw new Exception(); output.Write(buffer, 0, count); }
                        output.Position = 0; using (var loaded = Image.FromStream(output)) next = new Bitmap(loaded);
                    }
                }
            }
        } catch {}
        if (IsDisposed || url != imageUrl) { if (next != null) next.Dispose(); return; }
        var old = thumbnail; thumbnail = next; if (old != null) old.Dispose(); Invalidate();
    }
    static GraphicsPath Rounded(Rectangle r, int radius) {
        int diameter = radius * 2; var p = new GraphicsPath();
        p.AddArc(r.Left, r.Top, diameter, diameter, 180, 90); p.AddArc(r.Right - diameter, r.Top, diameter, diameter, 270, 90);
        p.AddArc(r.Right - diameter, r.Bottom - diameter, diameter, diameter, 0, 90); p.AddArc(r.Left, r.Bottom - diameter, diameter, diameter, 90, 90); p.CloseFigure(); return p;
    }
    static string Time(double seconds) { int n = (int)Math.Max(0, seconds); return n >= 3600 ? (n / 3600) + ":" + ((n / 60) % 60).ToString("00") + ":" + (n % 60).ToString("00") : (n / 60) + ":" + (n % 60).ToString("00"); }
    void Label(Graphics g, string text, int x, int y, int w, int h, float size, Color color, bool bold = false) {
        using (var font = new Font("Malgun Gothic", size, bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Point)) TextRenderer.DrawText(g, text, font, new Rectangle(x, y, w, h), color, TextFormatFlags.EndEllipsis | TextFormatFlags.SingleLine | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix);
    }
    protected override void OnPaint(PaintEventArgs e) {
        base.OnPaint(e); var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        bool light = Data.Str(style, "theme") == "light", compact = Data.Str(style, "theme") == "compact";
        Color foreground = light ? Color.FromArgb(32, 38, 58) : Color.FromArgb(239, 242, 252), muted = light ? Color.FromArgb(108, 117, 139) : Color.FromArgb(149, 161, 187);
        Color accent; try { accent = ColorTranslator.FromHtml(Data.Str(style, "accent", "#a8b5ff")); } catch { accent = Color.LightSteelBlue; }
        using (var brush = new SolidBrush(accent)) g.FillEllipse(brush, 18, 18, 6, 6);
        string type = Data.Num(data, "type") == 2 ? Locale.T("듣는 중") : Data.Num(data, "type") == 3 ? Locale.T("시청 중") : Locale.T("플레이 중");
        Label(g, data.Count == 0 ? "PRESENCE STUDIO" : type, 29, 11, Width - 90, 19, 7.5f, muted, true);
        if (Data.Bool(data, "paused")) Label(g, Locale.T("일시정지"), Width - 75, 11, 60, 19, 7, muted);
        int x = 18, y = compact ? 37 : 43, picture = compact ? 40 : 64;
        if (Data.Bool(style, "showImage", true)) {
            Rectangle rect = new Rectangle(x, y, picture, picture);
            if (thumbnail != null) {
                var saved = g.Save(); using (var rounded = Rounded(rect, 9)) g.SetClip(rounded);
                float scale = Math.Max((float)picture / thumbnail.Width, (float)picture / thumbnail.Height);
                float w = thumbnail.Width * scale, h = thumbnail.Height * scale; g.DrawImage(thumbnail, x - (w - picture) / 2, y - (h - picture) / 2, w, h); g.Restore(saved);
            } else { using (var b = new SolidBrush(Color.FromArgb(40, accent))) using (var rounded = Rounded(rect, 9)) g.FillPath(b, rounded); Label(g, "P", x, y, picture, picture, compact ? 17 : 24, accent, true); }
            x += picture + 14;
        }
        Label(g, Data.Str(data, "title", Locale.T("지금은 잠시 쉬는 중")), x, y, Width - x - 18, compact ? 21 : 29, compact ? 10 : 11.5f, foreground, true);
        Label(g, Data.Str(data, "subtitle", Locale.T("재생을 시작하면 자동으로 표시됩니다")), x, y + (compact ? 22 : 32), Width - x - 18, 22, 8.5f, muted);
        if (!compact && Data.Bool(style, "showProgress", true) && data.Count > 0) {
            double position = Data.Num(data, "position"); if (!Data.Bool(data, "paused") && !Data.Bool(data, "live")) position += Math.Max(0, Data.Now - Data.Num(data, "updatedAt", Data.Now)) / 1000 * Data.Num(data, "rate", 1);
            double duration = Data.Num(data, "duration"); int barWidth = Width - 122;
            if (duration > 0) { using (var b = new SolidBrush(Color.FromArgb(45, muted))) g.FillRectangle(b, 18, Height - 26, barWidth, 3); using (var b = new SolidBrush(accent)) g.FillRectangle(b, 18, Height - 26, (float)(barWidth * Math.Min(1, position / duration)), 3); }
            string counter = Data.Bool(data, "live") ? "LIVE" : duration > 0 ? Time(Math.Min(position, duration)) + " / " + Time(duration) : Data.Str(data, "timer") == "none" ? "" : Time(position);
            Label(g, counter, duration > 0 ? Width - 95 : 16, Height - 36, duration > 0 ? 82 : Width - 32, 23, 7.5f, muted);
        }
    }
    protected override async void OnMouseDown(MouseEventArgs e) {
        base.OnMouseDown(e);
        if (e.Button == MouseButtons.Right) { showStudio(); return; }
        if (e.Button != MouseButtons.Left || Data.Bool(style, "locked") || through) return;
        dragging = true; Native.ReleaseCapture(); Native.SendMessage(Handle, 0xA1, new IntPtr(2), IntPtr.Zero);
        try { lastX = Left; lastY = Top; await savePosition(Location); } catch {} finally { dragging = false; }
    }
    protected override void Dispose(bool disposing) { if (disposing) { images.Dispose(); if (thumbnail != null) thumbnail.Dispose(); } base.Dispose(disposing); }
}
