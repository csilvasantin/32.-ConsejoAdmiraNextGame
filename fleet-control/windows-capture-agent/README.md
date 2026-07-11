# Agente de captura Windows (Zenbook y otros PCs de la flota)

Equivalente Windows de AgoraCapture (Mac). Binarios compilados (no scripts, para no
disparar el AMSI de PowerShell). Compilar con el csc de .NET Framework (viene con Windows):

    csc /target:winexe /out:FleetCapture.exe /r:System.Drawing.dll /r:System.Windows.Forms.dll FleetCapture.cs
    csc /target:exe    /out:FleetTrigger.exe FleetTrigger.cs

Instalar en `%USERPROFILE%\.fleet\`. FleetCapture.exe = demonio (Tarea Programada,
sesión interactiva) que vigila capture.req y deja `<nonce>\n<base64 jpg>` en capture.out.
FleetTrigger.exe = lo ejecuta el hub por SSH; dispara el handshake e imprime el base64.
server.js: platOf reconoce 'windows'; screenshot.windows ejecuta FleetTrigger.exe.
