using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Web.Script.Serialization;

// Embedded in both the desktop shell and installer, including the removal helper.
static class Locale {
    public static string Language = "en";
    static readonly Dictionary<string, string> English = ReadMessages();
    static Dictionary<string, string> ReadMessages() {
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("en.json"))
        using (var reader = new StreamReader(stream)) return new JavaScriptSerializer().Deserialize<Dictionary<string, string>>(reader.ReadToEnd());
    }
    public static string T(string source) {
        string value;
        return Language == "en" && English.TryGetValue(source, out value) ? value : source;
    }
    public static void ReadSettings(string path) {
        if (!File.Exists(path)) { Language = "en"; return; }
        try {
            var data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(path));
            object language;
            Language = data.TryGetValue("language", out language) && Convert.ToString(language) == "en" ? "en" : "ko";
        } catch { Language = "en"; }
    }
}
