using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class GameWindow
{
    internal static void Open(string address, string verification)
    {
        string local=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ArmageddonTable");
        string runtime=Path.Combine(local,"runtime","1.0.2903.40-x64");
        Directory.CreateDirectory(runtime);
        string native=Path.Combine(runtime,"WebView2Loader.dll");
        if (!File.Exists(native)) {
            string pending=Path.Combine(runtime,Guid.NewGuid().ToString("N")+".tmp");
            File.WriteAllBytes(pending,Launcher.Resource("WebView2Loader.dll"));
            try {File.Move(pending,native);}
            catch(IOException) {if(!File.Exists(native))throw; File.Delete(pending);}
        }
        CoreWebView2Environment.SetLoaderDllFolderPath(runtime);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (Form form=new Form())
        using (WebView2 web=new WebView2())
        {
            form.Text="아마겟돈 전장 · 워해머 40,000";
            form.ClientSize=new Size(1440,900);
            form.MinimumSize=new Size(840,560);
            form.StartPosition=FormStartPosition.CenterScreen;
            web.Dock=DockStyle.Fill;
            form.Controls.Add(web);
            form.Shown += async delegate
            {
                try {
                    string profile=verification==null ? Path.Combine(local,"GameProfile") :
                        Path.Combine(Path.GetTempPath(),"Armageddon-QA-"+Guid.NewGuid().ToString("N"));
                    CoreWebView2Environment env=await CoreWebView2Environment.CreateAsync(null,profile);
                    await web.EnsureCoreWebView2Async(env);
                    web.CoreWebView2.Settings.IsStatusBarEnabled=false;
                    web.CoreWebView2.Settings.IsZoomControlEnabled=false;
                    web.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled=false;
                    web.CoreWebView2.DownloadStarting += delegate(object sender,CoreWebView2DownloadStartingEventArgs e){
                        using(SaveFileDialog save=new SaveFileDialog()){
                            save.Title="전장 저장 파일";
                            save.Filter="전장 저장 파일 (*.json)|*.json";
                            save.FileName="armageddon-table.json";
                            save.AddExtension=true;
                            if(save.ShowDialog(form)==DialogResult.OK)e.ResultFilePath=save.FileName;
                            else e.Cancel=true;
                            e.Handled=true;
                        }
                    };
                    web.CoreWebView2.NewWindowRequested += delegate(object sender,CoreWebView2NewWindowRequestedEventArgs e){
                        e.Handled=true;
                        Uri target;
                        if(Uri.TryCreate(e.Uri,UriKind.Absolute,out target)&&target.Scheme=="https")
                            Process.Start(new ProcessStartInfo(target.AbsoluteUri){UseShellExecute=true});
                    };
                    web.CoreWebView2.Navigate(address+"/");
                    if(verification!=null){
                        Stopwatch limit=Stopwatch.StartNew();
                        string metrics="null";
                        while(limit.Elapsed.TotalSeconds<90) {
                            await Task.Delay(400);
                            metrics=await web.CoreWebView2.ExecuteScriptAsync("window.tabletopView ? tabletopView.stats() : null");
                            if(metrics.Contains("\"pieces\":61"))break;
                        }
                        if(!metrics.Contains("\"pieces\":61"))throw new IOException("Native game did not render all 61 pieces. "+await web.CoreWebView2.ExecuteScriptAsync("document.body.innerText.slice(-1200)"));
                        using(FileStream image=File.Create(Path.Combine(verification,"native-window.png")))
                            await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
                        File.WriteAllText(Path.Combine(verification,"native-window.json"),metrics);
                        form.Close();
                    }
                } catch(Exception error){
                    Environment.ExitCode=1;
                    if(verification!=null)File.WriteAllText(Path.Combine(verification,"native-error.txt"),error.ToString());
                    else MessageBox.Show(form,error.Message,form.Text,MessageBoxButtons.OK,MessageBoxIcon.Error);
                    form.Close();
                }
            };
            Application.Run(form);
        }
    }
}
