@echo off
rem AmoxSQL desde la consola: corre un proceso de Data Flow y devuelve su codigo.
rem
rem     amoxsql run <proceso.sqlchain> --project <carpeta> [--param nombre=valor]...
rem
rem AmoxSQL.exe es una aplicacion grafica: una consola no la espera ni ve lo que
rem escribe. Dentro de un .cmd si espera, asi que este archivo la lanza, espera,
rem ensena el resultado que deja en un archivo temporal y sale con su codigo.
rem Codigos: 0 bien, 1 fallo el proceso, 2 argumentos, 3 falta una credencial,
rem 4 AmoxSQL abierto no contesto, 5 no existe el proyecto o el proceso.
setlocal
set "EXE=%~dp0..\AmoxSQL.exe"
set "INFORME=%TEMP%\amoxsql-%RANDOM%%RANDOM%.txt"
"%EXE%" %* --informe "%INFORME%"
set "CODIGO=%ERRORLEVEL%"
if exist "%INFORME%" (
    type "%INFORME%"
    del "%INFORME%" >nul 2>&1
)
exit /b %CODIGO%
