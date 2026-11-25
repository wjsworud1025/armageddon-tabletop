using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class Launcher
{
    const int Port = 41946;
    const string Address = "http://127.0.0.1:41946";
    static readonly Dictionary<string, byte[]> Files = new Dictionary<string, byte[]>(StringComparer.Ordinal);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr handle, int command);

    [STAThread]
    static void Main(string[] args)
    {
        AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs request)
        {
            string name = new AssemblyName(request.Name).Name;
            if (name != "Microsoft.Web.WebView2.Core" && name != "Microsoft.Web.WebView2.WinForms") return null;
            return Assembly.Load(Resource(name + ".dll"));
        };
        try {
            if(args.Length!=0) { Run(args); return; }
            bool first;
            using(Mutex singleton=new Mutex(true,"Local\\ArmageddonTableWindow2026",out first)){
                if(first) { try {Run(args);} finally {singleton.ReleaseMutex();} }
                else foreach(Process p in Process.GetProcessesByName(Process.GetCurrentProcess().ProcessName)){
                    using(p) { if(p.MainWindowHandle!=IntPtr.Zero){ShowWindowAsync(p.MainWindowHandle,9);SetForegroundWindow(p.MainWindowHandle);break;} }
                }
            }
        }
        catch (Exception ex) {
            Environment.ExitCode = 1;
            if (args.Length==2 && args[0]=="--verify-window") File.WriteAllText(Path.Combine(args[1],"native-error.txt"),ex.ToString());
            else MessageBox.Show(ex.Message, "Armageddon Table", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    internal static byte[] Resource(string name) {
        using (Stream src=Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
        using (MemoryStream dst=new MemoryStream()) {src.CopyTo(dst);return dst.ToArray();}
    }

    static void Run(string[] args)
    {
        bool serverOnly = Array.IndexOf(args, "--serve") >= 0;
        string verification = args.Length==2 && args[0]=="--verify-window" ? args[1] : null;
        TcpListener listener = new TcpListener(IPAddress.Loopback, Port);
        try { listener.Start(); }
        catch (SocketException)
        {
            if(verification!=null)throw new IOException("Close the running table before the native package test.");
            using (WebClient probe = new WebClient())
            {
                probe.Proxy = null;
                if (probe.DownloadString(Address + "/table-health") != "armageddon-2026-v1")
                    throw new IOException("Port 41946 is already in use by a different application.");
            }
            if (!serverOnly) GameWindow.Open(Address, verification);
            return;
        }
        try
        {
            using (Stream embedded = Assembly.GetExecutingAssembly().GetManifestResourceStream("table.zip"))
            using (ZipArchive zip = new ZipArchive(embedded, ZipArchiveMode.Read))
            {
                foreach (ZipArchiveEntry e in zip.Entries)
                using (Stream source = e.Open())
                using (MemoryStream bytes = new MemoryStream())
                {
                    source.CopyTo(bytes);
                    Files["/" + e.FullName.Replace('\\','/')] = bytes.ToArray();
                }
            }
            Thread accept = new Thread(delegate()
            {
                try { while (true) { TcpClient client = listener.AcceptTcpClient(); ThreadPool.QueueUserWorkItem(Serve, client); } }
                catch (SocketException) { }
            });
            accept.IsBackground = true;
            accept.Start();
            if (serverOnly) accept.Join();
            else GameWindow.Open(Address, verification);
        }
        finally { listener.Stop(); }
    }

    static void Serve(object state)
    {
        try
        {
            using (TcpClient client = (TcpClient)state)
            using (NetworkStream stream = client.GetStream())
            using (StreamReader reader = new StreamReader(stream, Encoding.ASCII, false, 2048, true))
            {
                client.ReceiveTimeout = 5000;
                client.SendTimeout = 10000;
                string first = reader.ReadLine() ?? "";
                string[] words = first.Split(' ');
                if (words.Length != 3 || (words[0] != "GET" && words[0] != "HEAD")) return;
                string line, host = "";
                for (int i=0; i<80; i++)
                {
                    line = reader.ReadLine();
                    if (String.IsNullOrEmpty(line)) break;
                    if (line.StartsWith("Host:",StringComparison.OrdinalIgnoreCase)) host=line.Substring(5).Trim();
                }
                if (host != "127.0.0.1:" + Port) return;
                string path=words[1].Split('?')[0];
                if (path=="/") path="/index.html";
                byte[] data;
                string status = "200 OK";
                if (path=="/table-health") data=Encoding.ASCII.GetBytes("armageddon-2026-v1");
                else if (!Files.TryGetValue(path,out data)) {status="404 Not Found";data=new byte[0];}
                string mime;
                switch (Path.GetExtension(path)) {
                    case ".html": mime="text/html; charset=utf-8";break;
                    case ".mjs": case ".js": mime="application/javascript; charset=utf-8";break;
                    case ".css": mime="text/css; charset=utf-8";break;
                    case ".svg": mime="image/svg+xml";break;
                    case ".png": mime="image/png";break;
                    case ".jpg": mime="image/jpeg";break;
                    case ".webp": mime="image/webp";break;
                    case ".json": mime="application/json";break;
                    case ".whm": mime="application/octet-stream";break;
                    default: mime="text/plain; charset=utf-8";break;
                }
                byte[] header=Encoding.ASCII.GetBytes("HTTP/1.1 "+status+"\r\nContent-Type: "+mime+"\r\nContent-Length: "+data.Length+
                    "\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n");
                stream.Write(header,0,header.Length);
                if(words[0]=="GET")stream.Write(data,0,data.Length);
            }
        }
        catch(IOException) { }
        catch(SocketException) { }
    }
}
