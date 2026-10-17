using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Drawing;
using System.Diagnostics;
using System.Net.Http;
using System.Reflection;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

static class Setup {
    internal const string Product = "Presence Studio";
    internal const string Marker = "PresenceStudio.Installation.v1";
    internal static readonly string Target = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Presence Studio");
    internal static readonly string UserData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PresenceStudio");
    internal const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\PresenceStudio";
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    internal static string Version { get { using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("version.txt")) using(var reader=new StreamReader(stream)) return reader.ReadToEnd().Trim(); } }
    [STAThread] static int Main(string[] args) {
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        string verification=args.FirstOrDefault(x=>x.StartsWith("--verify="));
        if(verification==null)Locale.ReadSettings(Path.Combine(UserData,"config.json"));
        try {
            if(verification!=null) { Verify(verification.Substring(9)); return 0; }
            bool remove=args.Contains("--remove");
            if(Path.GetFileName(Application.ExecutablePath).Equals("PresenceStudio-Uninstall.exe",StringComparison.OrdinalIgnoreCase)) {
                string helper=Path.Combine(Path.GetTempPath(),"PresenceStudio-Uninstall-"+Guid.NewGuid().ToString("N")+".exe");
                File.Copy(Application.ExecutablePath,helper);
                Process.Start(new ProcessStartInfo(helper,"--remove") {UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden});return 0;
            }
            bool created;
            using(var mutex=new Mutex(true,"Local\\PresenceStudioInstaller",out created)) {
                if(!created)throw new Exception(Locale.T("다른 설치 또는 제거 작업이 진행 중이에요."));
                if(remove) {
                    if(MessageBox.Show(Locale.T("Presence Studio를 제거할까요?\nID·프리셋·사진은 보관됩니다."),Product,MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return 0;
                    StopApplication().GetAwaiter().GetResult();
                    RemoveInstallation(Target);RemoveShortcuts();Registry.CurrentUser.DeleteSubKeyTree(UninstallKey,false);
                    MessageBox.Show(Locale.T("앱을 제거했어요. 개인 설정과 사진은 그대로 보관됩니다."),Product);return 0;
                }
                Application.Run(new SetupWindow(args.Contains("/SILENT")));
            }
            return 0;
        }catch(Exception error){if(verification!=null){string folder=verification.Substring(9);if(Directory.Exists(folder))File.WriteAllText(Path.Combine(folder,"error.txt"),error.ToString());}else MessageBox.Show(error.Message,Product+Locale.T(" 설치"),MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
    }
    internal static void CheckTarget(string target, bool test=false) {
        string full=Path.GetFullPath(target).TrimEnd(Path.DirectorySeparatorChar);
        if(!test && !full.Equals(Path.GetFullPath(Target),StringComparison.OrdinalIgnoreCase))throw new Exception(Locale.T("설치 경로를 확인할 수 없습니다."));
        if((Directory.Exists(full) && (File.GetAttributes(full)&FileAttributes.ReparsePoint)!=0))throw new Exception(Locale.T("연결된 폴더에는 설치할 수 없습니다."));
        if(Directory.Exists(full)&&Directory.EnumerateFileSystemEntries(full).Any()&&(!File.Exists(Path.Combine(full,"installed.ini"))||File.ReadAllText(Path.Combine(full,"installed.ini"))!=Marker))throw new Exception(Locale.T("설치 폴더에 다른 파일이 있어요. 기존 폴더를 먼저 확인하세요."));
    }
    internal static void SafeDelete(string folder,string parent) {
        string full=Path.GetFullPath(folder),boundary=Path.GetFullPath(parent).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
        if(!full.StartsWith(boundary,StringComparison.OrdinalIgnoreCase)||full.Equals(boundary.TrimEnd(Path.DirectorySeparatorChar),StringComparison.OrdinalIgnoreCase))throw new Exception(Locale.T("삭제 범위를 확인할 수 없습니다."));
        if(!Directory.Exists(full))return;
        // Do not recurse into junctions or symbolic links, including nested entries.
        foreach(string entry in Directory.EnumerateFileSystemEntries(full)) {
            var attributes=File.GetAttributes(entry);
            if((attributes&FileAttributes.Directory)!=0) {
                if((attributes&FileAttributes.ReparsePoint)!=0)Directory.Delete(entry);else SafeDelete(entry,full);
            } else File.Delete(entry);
        }
        Directory.Delete(full);
    }
    internal static void Extract(string directory,Action<int,string> progress) {
        using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip")) {
            if(stream==null)throw new Exception(Locale.T("설치 파일이 손상됐어요. 다시 다운로드하세요."));
            using(var archive=new ZipArchive(stream,ZipArchiveMode.Read)) {
                int index=0;
                foreach(var entry in archive.Entries) {
                    string name=entry.FullName.Replace('/',Path.DirectorySeparatorChar);
                    string file=Path.GetFullPath(Path.Combine(directory,name));
                    if(!file.StartsWith(Path.GetFullPath(directory)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||name.Contains(":"))throw new Exception(Locale.T("설치 파일의 경로가 올바르지 않습니다."));
                    if(String.IsNullOrEmpty(entry.Name))continue;
                    Directory.CreateDirectory(Path.GetDirectoryName(file));entry.ExtractToFile(file);
                    progress(10+(++index*55/archive.Entries.Count),Locale.T("프로그램 파일을 준비하는 중…"));
                }
            }
        }
        foreach(string file in new[]{"desktop/Presence Studio.exe","runtime/node.exe","server.mjs","package.json","PresenceStudio-Uninstall.exe"})if(!File.Exists(Path.Combine(directory,file)))throw new Exception(Locale.T("필수 설치 파일이 없습니다."));
        File.WriteAllText(Path.Combine(directory,"installed.ini"),Marker);
    }
    internal static void InstallFiles(string target,Action<int,string> progress,bool test=false,Action afterMove=null) {
        CheckTarget(target,test);string parent=Path.GetDirectoryName(target);Directory.CreateDirectory(parent);
        string stage=Path.Combine(parent,".PresenceStudio-stage-"+Guid.NewGuid().ToString("N"));
        string backup=Path.Combine(parent,".PresenceStudio-backup-"+Guid.NewGuid().ToString("N"));
        bool movedOld=false,movedNew=false;
        try {
            Directory.CreateDirectory(stage);Extract(stage,progress);
            if(Directory.Exists(target)){Directory.Move(target,backup);movedOld=true;}
            Directory.Move(stage,target);movedNew=true;
            if(afterMove!=null)afterMove();
            progress(85,Locale.T("설치 파일 교체를 마쳤어요."));
        }catch {
            if(movedNew)SafeDelete(target,parent);
            if(movedOld)Directory.Move(backup,target);
            throw;
        }finally {
            if(Directory.Exists(stage))SafeDelete(stage,parent);
        }
        // A backup cleanup failure must not roll back an already completed install.
        if(movedOld)try{SafeDelete(backup,parent);}catch{}
    }
    internal static async Task StopApplication() {
        using(var client=new HttpClient {Timeout=TimeSpan.FromSeconds(4)}) {
            try {
                string health=await client.GetStringAsync("http://127.0.0.1:49832/api/health");
                if(!health.Contains("youtube-discord-local"))throw new Exception(Locale.T("다른 앱이 연결 포트를 사용 중이에요."));
                var config=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(UserData,"config.json")));
                using(var request=new HttpRequestMessage(HttpMethod.Post,"http://127.0.0.1:49832/api/stop")) {
                    request.Headers.Add("X-Bridge-Token",Convert.ToString(config["token"]));request.Content=new StringContent("{}",System.Text.Encoding.UTF8,"application/json");
                    using(var response=await client.SendAsync(request))response.EnsureSuccessStatusCode();
                }
            }catch(HttpRequestException error) { if(error.InnerException==null)throw; }catch(TaskCanceledException){throw new Exception(Locale.T("실행 중인 앱을 종료하지 못했어요. 트레이에서 앱을 종료하고 다시 설치하세요."));}
        }
        for(int i=0;i<90;i++) {
            bool running=false;
            foreach(var process in Process.GetProcessesByName("Presence Studio"))using(process) {
                try{string executable=process.MainModule.FileName;string root=Path.GetFullPath(Path.Combine(Path.GetDirectoryName(executable),".."));string package=Path.Combine(root,"package.json");if(File.Exists(package)&&File.ReadAllText(package).Contains("\"youtube-discord-local\""))running=true;}catch{}
            }
            if(!running)return;await Task.Delay(500);
        }
        throw new Exception(Locale.T("앱을 트레이에서 완전히 종료하고 다시 설치하세요."));
    }
    internal static bool HasWebView() {
        foreach(var hive in new[]{RegistryHive.CurrentUser,RegistryHive.LocalMachine})foreach(var view in new[]{RegistryView.Registry32,RegistryView.Registry64}) {
            using(var key=RegistryKey.OpenBaseKey(hive,view))using(var client=key.OpenSubKey(@"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}")) {
                System.Version version;if(client!=null&&System.Version.TryParse(Convert.ToString(client.GetValue("pv")),out version)&&version>new System.Version(0,0,0,0))return true;
            }
        }
        return false;
    }
    internal static async Task EnsureWebView(Action<int,string> progress) {
        if(HasWebView())return;
        progress(2,Locale.T("Microsoft WebView2를 설치하는 중… 인터넷 연결이 필요해요."));
        string file=Path.Combine(Path.GetTempPath(),"PresenceStudio-WebView2-"+Guid.NewGuid().ToString("N")+".exe");
        try {
            using(var resource=Assembly.GetExecutingAssembly().GetManifestResourceStream("webview.exe"))using(var output=File.Create(file))resource.CopyTo(output);
            using(var process=Process.Start(new ProcessStartInfo(file,"/silent /install"){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden})) {
                bool exited=await Task.Run(()=>process.WaitForExit(300000));
                if(!exited||!HasWebView())throw new Exception(Locale.T("WebView2 설치를 마치지 못했어요. 인터넷 연결을 확인하고 다시 시도하세요. 기존 앱은 그대로 유지됩니다."));
            }
        }finally{try{File.Delete(file);}catch{}}
    }
    internal static void Shortcut(string location,string executable,string arguments="") {
        Directory.CreateDirectory(Path.GetDirectoryName(location));
        dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic shortcut=shell.CreateShortcut(location);
        shortcut.TargetPath=executable;shortcut.Arguments=arguments;shortcut.WorkingDirectory=Target;shortcut.IconLocation=Path.Combine(Target,"desktop","studio.ico");shortcut.Save();
    }
    internal static void Register(bool desktop) {
        string executable=Path.Combine(Target,"desktop","Presence Studio.exe");
        Shortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"Presence Studio.lnk"),executable);
        if(desktop)Shortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"Presence Studio.lnk"),executable);
        string startup=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup),"YouTube Discord.lnk");
        if(File.Exists(startup))Shortcut(startup,executable,"--background");
        using(var key=Registry.CurrentUser.CreateSubKey(UninstallKey)) {
            key.SetValue("DisplayName",Product);key.SetValue("DisplayVersion",Version);key.SetValue("Publisher","Presence Studio");key.SetValue("InstallLocation",Target);
            key.SetValue("DisplayIcon",executable);key.SetValue("UninstallString","\""+Path.Combine(Target,"PresenceStudio-Uninstall.exe")+"\"");
            key.SetValue("NoModify",1);key.SetValue("NoRepair",1);
        }
    }
    internal static void RemoveInstallation(string target,bool test=false){CheckTarget(target,test);SafeDelete(target,Path.GetDirectoryName(target));}
    internal static void RemoveShortcuts(){
        foreach(var folder in new[]{Environment.SpecialFolder.Programs,Environment.SpecialFolder.DesktopDirectory}) {
            string file=Path.Combine(Environment.GetFolderPath(folder),"Presence Studio.lnk");if(File.Exists(file))File.Delete(file);
        }
        string startup=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup),"YouTube Discord.lnk");
        if(File.Exists(startup)) {
            dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic shortcut=shell.CreateShortcut(startup);
            if(Convert.ToString(shortcut.TargetPath).StartsWith(Target+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))File.Delete(startup);
        }
    }
    internal static void Launch(){Process.Start(new ProcessStartInfo(Path.Combine(Target,"desktop","Presence Studio.exe")){WorkingDirectory=Target,UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden});}
    internal static void Verify(string directory) {
        string full=Path.GetFullPath(directory),boundary=Path.Combine(Path.GetTempPath(),"PresenceStudioInstallerTests")+Path.DirectorySeparatorChar;
        if(!full.StartsWith(boundary,StringComparison.OrdinalIgnoreCase))throw new Exception("Isolated installer verification directory required.");
        Directory.CreateDirectory(full);string target=Path.Combine(full,"app");
        Action<int,string> progress=(n,s)=>{};InstallFiles(target,progress,true);
        using(var node=Process.Start(new ProcessStartInfo(Path.Combine(target,"runtime","node.exe"),"--version"){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,RedirectStandardOutput=true})) {
            string version=node.StandardOutput.ReadToEnd();node.WaitForExit();if(node.ExitCode!=0||!version.Trim().Equals("v22.23.3"))throw new Exception("Bundled Node runtime did not run");
        }
        File.WriteAllText(Path.Combine(target,"prior-version.txt"),"retained until successful update");
        bool rolledBack=false;try{InstallFiles(target,progress,true,()=>{throw new IOException("simulated replacement failure");});}catch(IOException){rolledBack=File.Exists(Path.Combine(target,"prior-version.txt"));}
        if(!rolledBack)throw new Exception("Rollback verification failed");
        InstallFiles(target,progress,true);if(File.Exists(Path.Combine(target,"prior-version.txt")))throw new Exception("Upgrade left old files behind");
        string settings=Path.Combine(full,"user-settings.txt");File.WriteAllText(settings,"preserve");
        RemoveInstallation(target,true);if(!File.Exists(settings)||Directory.Exists(target))throw new Exception("Uninstall verification failed");
        using(var window=new SetupWindow(false)) {
            window.Show();Application.DoEvents();
            foreach(int index in new[]{0,1}) {
                window.Controls.OfType<RadioButton>().Single(control=>Convert.ToString(control.Tag)==(index==0?"en":"ko")).Checked=true;Application.DoEvents();
                if(Locale.Language!=(index==0?"en":"ko")||!window.Text.Contains(index==0?"Setup":"설치"))throw new Exception("Installer language did not switch");
                using(var bitmap=new Bitmap(window.Width,window.Height)){window.DrawToBitmap(bitmap,new Rectangle(Point.Empty,window.Size));bitmap.Save(Path.Combine(full,index==0?"installer-en.png":"installer-ko.png"));}
            }
            window.Hide();
        }
        File.WriteAllText(Path.Combine(full,"result.json"),"{\"install\":true,\"upgrade\":true,\"rollback\":true,\"uninstall\":true,\"dataPreserved\":true,\"englishAndKorean\":true}");
    }
}
sealed class SetupWindow:Form {
    readonly Label status=new Label();readonly ProgressBar progress=new ProgressBar();readonly Button install=new Button();readonly CheckBox desktop=new CheckBox();readonly CheckBox launch=new CheckBox();readonly bool automatic;bool working,complete;
    public SetupWindow(bool automatic) {
        this.automatic=automatic;Text=Locale.T("Presence Studio 설치 · ")+Setup.Version;ClientSize=new Size(620,455);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;
        BackColor=Color.FromArgb(19,24,36);ForeColor=Color.FromArgb(235,240,255);Font=new Font("맑은 고딕",10);
        var english=new RadioButton{Text="English",Tag="en",Appearance=Appearance.Button,TextAlign=ContentAlignment.MiddleCenter,FlatStyle=FlatStyle.Flat,Left=423,Top=15,Width=82,Height=30,Checked=Locale.Language=="en"};
        var korean=new RadioButton{Text="한국어",Tag="ko",Appearance=Appearance.Button,TextAlign=ContentAlignment.MiddleCenter,FlatStyle=FlatStyle.Flat,Left=505,Top=15,Width=82,Height=30,Checked=Locale.Language=="ko"};
        Controls.Add(english);Controls.Add(korean);
        var title=new Label{Text=Locale.T("내 활동을, 나답게"),Font=new Font(Font.FontFamily,22,FontStyle.Bold),Left=28,Top=55,Width=560,Height=48};Controls.Add(title);
        var text=new Label{Text="Presence Studio "+Setup.Version+Locale.T(" · Windows 10/11 (64비트)\n앱과 Node.js를 함께 설치합니다. ID·프리셋·사진은 유지돼요.\n브라우저 확장은 설치 후 앱 안내에 따라 연결하세요."),Left=30,Top=112,Width=560,Height=88};Controls.Add(text);
        var location=new Label{Text=Locale.T("설치 위치: ")+Setup.Target,Left=30,Top=211,Width=560,Height=42};Controls.Add(location);
        desktop.Text=Locale.T("바탕화면에 바로가기 만들기");desktop.SetBounds(30,263,540,25);desktop.Checked=true;Controls.Add(desktop);
        launch.Text=Locale.T("설치 후 앱 실행");launch.SetBounds(30,292,540,25);launch.Checked=true;Controls.Add(launch);
        status.SetBounds(30,326,560,50);status.Text=Locale.T("설치를 누르면 시작합니다.");Controls.Add(status);progress.SetBounds(30,395,390,18);Controls.Add(progress);
        install.SetBounds(460,385,130,38);install.Text=Locale.T("설치");install.BackColor=Color.FromArgb(168,181,255);install.ForeColor=Color.FromArgb(20,28,50);install.FlatStyle=FlatStyle.Flat;Controls.Add(install);
        Action changeLanguage=delegate {
            Locale.Language=korean.Checked?"ko":"en";
            english.BackColor=english.Checked?Color.FromArgb(62,77,115):BackColor;korean.BackColor=korean.Checked?Color.FromArgb(62,77,115):BackColor;
            Text=Locale.T("Presence Studio 설치 · ")+Setup.Version;
            title.Text=Locale.T("내 활동을, 나답게");
            text.Text="Presence Studio "+Setup.Version+Locale.T(" · Windows 10/11 (64비트)\n앱과 Node.js를 함께 설치합니다. ID·프리셋·사진은 유지돼요.\n브라우저 확장은 설치 후 앱 안내에 따라 연결하세요.");
            location.Text=Locale.T("설치 위치: ")+Setup.Target;
            desktop.Text=Locale.T("바탕화면에 바로가기 만들기");launch.Text=Locale.T("설치 후 앱 실행");
            if(!working){status.Text=Locale.T(complete?"설치 완료! 시작 메뉴에서 앱을 열 수 있어요.":"설치를 누르면 시작합니다.");install.Text=Locale.T(complete?"닫기":"설치");}
        };
        english.CheckedChanged+=delegate {if(english.Checked)changeLanguage();};korean.CheckedChanged+=delegate {if(korean.Checked)changeLanguage();};changeLanguage();
        install.Click+=async delegate{if(complete){Close();return;}await Run();};FormClosing+=(s,e)=>{if(working)e.Cancel=true;};
        if(automatic)Shown+=async delegate{await Run();};
    }
    void Report(int value,string message){if(InvokeRequired){BeginInvoke(new Action(()=>Report(value,message)));return;}progress.Value=value;status.Text=message;}
    async Task Run(){
        working=true;foreach(Control control in Controls)if(control is RadioButton)control.Enabled=false;install.Enabled=false;desktop.Enabled=false;launch.Enabled=false;
        try {
            await Setup.EnsureWebView(Report);
            Report(5,Locale.T("실행 중인 앱을 종료하는 중…"));await Setup.StopApplication();
            bool createDesktop=desktop.Checked;await Task.Run(()=>Setup.InstallFiles(Setup.Target,Report));
            Setup.Register(createDesktop);
            if(!File.Exists(Path.Combine(Setup.UserData,"config.json"))) {Directory.CreateDirectory(Setup.UserData);File.WriteAllText(Path.Combine(Setup.UserData,"initial-language.txt"),Locale.Language);}
            Report(100,Locale.T("설치 완료! 시작 메뉴에서 앱을 열 수 있어요."));complete=true;install.Text=Locale.T("닫기");
            if(launch.Checked)Setup.Launch();
        }catch(Exception error){status.Text=Locale.T("설치 실패: ")+error.Message;MessageBox.Show(error.Message,Setup.Product,MessageBoxButtons.OK,MessageBoxIcon.Error);}
        finally{working=false;install.Enabled=true;desktop.Enabled=!complete;launch.Enabled=!complete;foreach(Control control in Controls)if(control is RadioButton)control.Enabled=true;}
        if(complete&&automatic)Close();
    }
}
