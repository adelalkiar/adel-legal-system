Option Explicit
' تشغيل صامت لنظام العادل — بدون نوافذ سوداء
Dim sh, fso, dir, logFile, i
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
logFile = dir & "\server.log"

Function RunHidden(cmd, wait)
  RunHidden = sh.Run(cmd, 0, wait)
End Function

Function HasNode()
  HasNode = (RunHidden("cmd /c where node >nul 2>nul", True) = 0)
End Function

Function PortListening()
  PortListening = (RunHidden("cmd /c netstat -ano | findstr "":3000"" | findstr ""LISTENING"" >nul", True) = 0)
End Function

If Not HasNode() Then
  MsgBox "لم يتم العثور على Node.js على هذا الجهاز." & vbCrLf & vbCrLf & _
         "حمّله من https://nodejs.org ثم شغّل البرنامج مرة أخرى.", 16, "نظام العادل للخدمات القانونية"
  WScript.Quit 1
End If

If Not fso.FolderExists(dir & "\node_modules") Then
  MsgBox "جاري تجهيز البرنامج لأول مرة. قد يستغرق ذلك دقيقة، ولا يحدث إلا مرة واحدة.", 64, "نظام العادل للخدمات القانونية"
  If sh.Run("cmd /c npm install", 1, True) <> 0 Then
    MsgBox "فشل التجهيز. تأكد من الاتصال بالإنترنت ثم حاول مرة أخرى.", 16, "نظام العادل للخدمات القانونية"
    WScript.Quit 1
  End If
End If

If Not PortListening() Then
  RunHidden "cmd /c node server.js >> """ & logFile & """ 2>&1", False
  For i = 1 To 24
    WScript.Sleep 400
    If PortListening() Then Exit For
  Next
End If

If Not PortListening() Then
  MsgBox "تعذر تشغيل الخادم. راجع ملف server.log بجانب البرنامج أو أرسله للمطور.", 16, "نظام العادل للخدمات القانونية"
  WScript.Quit 1
End If

sh.Run "http://localhost:3000", 1, False
