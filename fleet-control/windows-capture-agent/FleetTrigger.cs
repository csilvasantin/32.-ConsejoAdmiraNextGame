// FleetTrigger.exe — cliente de disparo del agente de captura del Zenbook.
// Lo ejecuta el hub (server.js) por SSH. NO captura pantalla (eso lo hace el
// demonio FleetCapture.exe en la sesión interactiva): solo orquesta el handshake
// por ficheros e imprime el base64 por stdout, que es lo que el panel espera.
//   escribe un nonce en ~/.fleet/capture.req -> espera a que ~/.fleet/capture.out
//   tenga ese nonce en la 1a linea -> imprime la 2a linea (base64) por stdout.
// Salida "ERR_NO_CAPTURE" si el demonio no responde a tiempo.
using System;
using System.IO;
using System.Text;
using System.Threading;

class FleetTrigger
{
    static void Main()
    {
        string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".fleet");
        string req = Path.Combine(dir, "capture.req");
        string outp = Path.Combine(dir, "capture.out");
        try { Directory.CreateDirectory(dir); } catch { }

        string nonce = "fc-" + Guid.NewGuid().ToString("N").Substring(0, 12);
        try { File.WriteAllText(req, nonce, new UTF8Encoding(false)); }
        catch { Console.Write("ERR_NO_CAPTURE"); Environment.Exit(1); }

        for (int i = 0; i < 40; i++)   // hasta ~12s
        {
            Thread.Sleep(300);
            try
            {
                if (File.Exists(outp))
                {
                    string c = File.ReadAllText(outp);
                    int nl = c.IndexOf('\n');
                    if (nl > 0 && c.Substring(0, nl).Trim() == nonce)
                    {
                        Console.Write(c.Substring(nl + 1).Trim());
                        Environment.Exit(0);
                    }
                }
            }
            catch { }
        }
        Console.Write("ERR_NO_CAPTURE");
        Environment.Exit(2);
    }
}
