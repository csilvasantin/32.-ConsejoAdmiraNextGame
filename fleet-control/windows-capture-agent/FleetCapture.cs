// FleetCapture.exe — agente de captura del Zenbook (AdmiraNeXT fleet).
// App compilada (no script) — equivalente Windows de AgoraCapture en Mac.
// Handshake por ficheros idéntico al de la flota:
//   vigila ~/.fleet/capture.req (un nonce) -> captura pantalla -> escribe
//   "<nonce>\n<base64 jpg>" en ~/.fleet/capture.out (LF), que es lo que el
//   panel (server.js: head -1 == nonce, tail -n +2 == base64) espera.
// Debe correr en la sesion interactiva del usuario (CopyFromScreen necesita escritorio).
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

class FleetCapture
{
    static readonly string Dir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".fleet");
    static readonly string Req = Path.Combine(Dir, "capture.req");
    static readonly string Out = Path.Combine(Dir, "capture.out");
    static readonly string LogF = Path.Combine(Dir, "fleet-capture.log");

    static void Log(string m)
    {
        try { File.AppendAllText(LogF, "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + m + "\n"); }
        catch { }
    }

    static string CaptureBase64()
    {
        Rectangle b = Screen.PrimaryScreen.Bounds;
        using (Bitmap full = new Bitmap(b.Width, b.Height))
        {
            using (Graphics g = Graphics.FromImage(full))
                g.CopyFromScreen(b.Location, Point.Empty, b.Size);

            Bitmap img = full;
            Bitmap resized = null;
            int maxW = 1100;
            if (b.Width > maxW)
            {
                int nh = (int)((long)b.Height * maxW / b.Width);
                resized = new Bitmap(maxW, nh);
                using (Graphics gg = Graphics.FromImage(resized))
                {
                    gg.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                    gg.DrawImage(full, 0, 0, maxW, nh);
                }
                img = resized;
            }

            using (MemoryStream ms = new MemoryStream())
            {
                ImageCodecInfo enc = null;
                foreach (ImageCodecInfo c in ImageCodecInfo.GetImageEncoders())
                    if (c.MimeType == "image/jpeg") enc = c;
                EncoderParameters ep = new EncoderParameters(1);
                ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 80L);
                img.Save(ms, enc, ep);
                if (resized != null) resized.Dispose();
                return Convert.ToBase64String(ms.ToArray());
            }
        }
    }

    static void WriteOut(string nonce, string payload)
    {
        string tmp = Out + ".tmp";
        File.WriteAllText(tmp, nonce + "\n" + payload, new UTF8Encoding(false));
        if (File.Exists(Out)) File.Delete(Out);
        File.Move(tmp, Out);
    }

    static void Main()
    {
        Directory.CreateDirectory(Dir);
        Log("arranque - FleetCapture.exe (Zenbook)");
        string last = null;
        while (true)
        {
            try
            {
                string n = null;
                if (File.Exists(Req)) { try { n = File.ReadAllText(Req).Trim(); } catch { } }
                if (!string.IsNullOrEmpty(n) && n != last)
                {
                    last = n;
                    try
                    {
                        string b64 = CaptureBase64();
                        if (b64 != null && b64.Length > 1000) { WriteOut(n, b64); Log("captura OK nonce=" + n + " (" + b64.Length + ")"); }
                        else { WriteOut(n, "ERR_NO_CAPTURE"); Log("captura vacia nonce=" + n); }
                    }
                    catch (Exception e) { WriteOut(n, "ERR_NO_CAPTURE"); Log("ERROR captura: " + e.Message); }
                }
            }
            catch (Exception e) { Log("ERROR bucle: " + e.Message); }
            Thread.Sleep(500);
        }
    }
}
