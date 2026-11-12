/* Todo4Me — texts of the main process (application menu, tray, native dialogs, notifications, updater and
 * calendar errors) in the four UI languages. The renderer reports its language with todo4meDesktop.setLanguage()
 * (see main.js); until then, and for anything missing, English is used.
 * t(key, params): "{name}" placeholders. Keep the keys of all languages identical. */
'use strict';

const LANGS = ['en', 'de', 'tr', 'es'];

// [en, de, tr, es] per key
const T = {
  // Application menu
  'menu.file': ['&File', '&Datei', '&Dosya', '&Archivo'],
  'menu.newTask': ['New task', 'Neue Aufgabe', 'Yeni görev', 'Nueva tarea'],
  'menu.quickCapture': ['Quick capture', 'Schnell erfassen', 'Hızlı not', 'Captura rápida'],
  'menu.newNote': ['New weekly note', 'Neue Wochennotiz', 'Yeni haftalık not', 'Nueva nota semanal'],
  'menu.newDoc': ['New document', 'Neues Dokument', 'Yeni belge', 'Documento nuevo'],
  'menu.exportPdf': ['Export document as PDF…', 'Dokument als PDF exportieren …', 'Belgeyi PDF olarak dışa aktar…', 'Exportar documento como PDF…'],
  'menu.exportData': ['Export data (JSON)…', 'Daten exportieren (JSON) …', 'Verileri dışa aktar (JSON)…', 'Exportar datos (JSON)…'],
  'menu.importData': ['Import data (JSON)…', 'Daten importieren (JSON) …', 'Verileri içe aktar (JSON)…', 'Importar datos (JSON)…'],
  'menu.openBackups': ['Open backups folder', 'Sicherungsordner öffnen', 'Yedek klasörünü aç', 'Abrir carpeta de copias'],
  'menu.openData': ['Open data folder', 'Datenordner öffnen', 'Veri klasörünü aç', 'Abrir carpeta de datos'],
  'menu.exit': ['Exit', 'Beenden', 'Çıkış', 'Salir'],
  'menu.edit': ['&Edit', '&Bearbeiten', '&Düzenle', '&Edición'],
  'menu.undo': ['Undo', 'Rückgängig', 'Geri al', 'Deshacer'],
  'menu.redo': ['Redo', 'Wiederholen', 'Yinele', 'Rehacer'],
  'menu.cut': ['Cut', 'Ausschneiden', 'Kes', 'Cortar'],
  'menu.copy': ['Copy', 'Kopieren', 'Kopyala', 'Copiar'],
  'menu.paste': ['Paste', 'Einfügen', 'Yapıştır', 'Pegar'],
  'menu.selectAll': ['Select all', 'Alles auswählen', 'Tümünü seç', 'Seleccionar todo'],
  'menu.go': ['&Go', '&Gehe zu', '&Git', '&Ir a'],
  'menu.dashboard': ['Dashboard', 'Übersicht', 'Pano', 'Panel'],
  'menu.inbox': ['Inbox', 'Eingang', 'Gelen Kutusu', 'Bandeja de entrada'],
  'menu.tasks': ['My Tasks', 'Meine Aufgaben', 'Görevlerim', 'Mis tareas'],
  'menu.today': ['Today', 'Heute', 'Bugün', 'Hoy'],
  'menu.upcoming': ['Upcoming', 'Demnächst', 'Yaklaşan', 'Próximamente'],
  'menu.planner': ['Weekly Planner', 'Wochenplaner', 'Haftalık Planlayıcı', 'Planificador semanal'],
  'menu.plan': ['Daily Plan', 'Tagesplan', 'Günlük Plan', 'Plan diario'],
  'menu.notes': ['Weekly Notes', 'Wochennotizen', 'Haftalık Notlar', 'Notas semanales'],
  'menu.editor': ['Editor', 'Editor', 'Editör', 'Editor'],
  'menu.focus': ['Focus Mode', 'Fokus-Modus', 'Odak Modu', 'Modo concentración'],
  'menu.stats': ['Statistics', 'Statistik', 'İstatistikler', 'Estadísticas'],
  'menu.settings': ['Settings', 'Einstellungen', 'Ayarlar', 'Ajustes'],
  'menu.view': ['&View', '&Ansicht', '&Görünüm', '&Ver'],
  'menu.reload': ['Reload', 'Neu laden', 'Yeniden yükle', 'Recargar'],
  'menu.devTools': ['Toggle developer tools', 'Entwicklertools ein-/ausblenden', 'Geliştirici araçlarını aç/kapat', 'Mostrar/ocultar herramientas de desarrollo'],
  'menu.resetZoom': ['Actual size', 'Originalgröße', 'Gerçek boyut', 'Tamaño real'],
  'menu.zoomIn': ['Zoom in', 'Vergrößern', 'Yakınlaştır', 'Ampliar'],
  'menu.zoomOut': ['Zoom out', 'Verkleinern', 'Uzaklaştır', 'Reducir'],
  'menu.fullscreen': ['Toggle full screen', 'Vollbild ein-/ausschalten', 'Tam ekranı aç/kapat', 'Pantalla completa'],
  'menu.help': ['&Help', '&Hilfe', '&Yardım', 'A&yuda'],
  'menu.checkUpdates': ['Check for updates…', 'Nach Updates suchen …', 'Güncellemeleri denetle…', 'Buscar actualizaciones…'],
  'menu.about': ['About Todo4Me', 'Über Todo4Me', 'Todo4Me hakkında', 'Acerca de Todo4Me'],
  'about.dataDir': ['Your data is stored locally on this computer:', 'Deine Daten werden lokal auf diesem Computer gespeichert:', 'Verilerin bu bilgisayarda yerel olarak saklanır:', 'Tus datos se guardan localmente en este equipo:'],
  'about.backupDir': ['Daily backup files:', 'Tägliche Sicherungsdateien:', 'Günlük yedek dosyaları:', 'Archivos de copia diarios:'],

  // Native dialogs
  'dlg.saveMarkdown': ['Save Markdown file', 'Markdown-Datei speichern', 'Markdown dosyasını kaydet', 'Guardar archivo Markdown'],
  'dlg.saveBackup': ['Save Todo4Me backup', 'Todo4Me-Sicherung speichern', 'Todo4Me yedeğini kaydet', 'Guardar copia de seguridad de Todo4Me'],
  'dlg.saveWord': ['Save Word document', 'Word-Dokument speichern', 'Word belgesini kaydet', 'Guardar documento de Word'],
  'dlg.saveHtml': ['Save HTML file', 'HTML-Datei speichern', 'HTML dosyasını kaydet', 'Guardar archivo HTML'],
  'dlg.saveText': ['Save text file', 'Textdatei speichern', 'Metin dosyasını kaydet', 'Guardar archivo de texto'],
  'dlg.saveRtf': ['Save Rich Text file', 'Rich-Text-Datei speichern', 'Zengin Metin dosyasını kaydet', 'Guardar archivo de texto enriquecido'],
  'flt.rtf': ['Rich Text Format', 'Rich Text Format', 'Zengin Metin Biçimi', 'Formato de texto enriquecido'],
  'dlg.saveFile': ['Save file', 'Datei speichern', 'Dosyayı kaydet', 'Guardar archivo'],
  'flt.word': ['Word document', 'Word-Dokument', 'Word belgesi', 'Documento de Word'],
  'flt.text': ['Text', 'Text', 'Metin', 'Texto'],
  'flt.all': ['All files', 'Alle Dateien', 'Tüm dosyalar', 'Todos los archivos'],
  'dlg.exportPdf': ['Export as PDF', 'Als PDF exportieren', 'PDF olarak dışa aktar', 'Exportar como PDF'],

  // Tray, notifications
  'tray.open': ['Open Todo4Me', 'Todo4Me öffnen', 'Todo4Me’yi aç', 'Abrir Todo4Me'],
  'tray.quit': ['Quit Todo4Me', 'Todo4Me beenden', 'Todo4Me’den çık', 'Salir de Todo4Me'],
  'tray.hintTitle': ['Todo4Me keeps running in the tray', 'Todo4Me läuft im Infobereich weiter', 'Todo4Me sistem tepsisinde çalışmaya devam ediyor', 'Todo4Me sigue ejecutándose en la bandeja'],
  'tray.hintBody': ['Reminders keep working. Click the Todo4Me icon in the notification area to open it again; right-click it → Quit to exit.', 'Erinnerungen funktionieren weiter. Klicke auf das Todo4Me-Symbol im Infobereich, um die App wieder zu öffnen; mit Rechtsklick → Beenden schließt du sie ganz.', 'Hatırlatıcılar çalışmaya devam eder. Uygulamayı yeniden açmak için bildirim alanındaki Todo4Me simgesine tıkla; tamamen kapatmak için sağ tıkla → Çık.', 'Los recordatorios siguen funcionando. Haz clic en el icono de Todo4Me del área de notificaciones para abrirlo de nuevo; clic derecho → Salir para cerrarlo del todo.'],
  'notif.snooze': ['Snooze 10 min', '10 Min. später erinnern', '10 dk ertele', 'Posponer 10 min'],
  'notif.unsupported': ['Notifications are not supported on this system.', 'Benachrichtigungen werden auf diesem System nicht unterstützt.', 'Bu sistemde bildirimler desteklenmiyor.', 'Este sistema no admite notificaciones.'],
  'notif.updateTitle': ['Todo4Me {version} is ready', 'Todo4Me {version} ist bereit', 'Todo4Me {version} hazır', 'Todo4Me {version} está listo'],
  'notif.updateBody': ['Click to restart and update now. Your data is kept.', 'Klicke, um jetzt neu zu starten und zu aktualisieren. Deine Daten bleiben erhalten.', 'Şimdi yeniden başlatıp güncellemek için tıkla. Verilerin korunur.', 'Haz clic para reiniciar y actualizar ahora. Tus datos se conservan.'],

  // Background settings messages
  'bg.hotkeyTaken': ['{key} is already used by another program, so Todo4Me could not reserve it. Choose a different shortcut.', '{key} wird schon von einem anderen Programm verwendet, deshalb konnte Todo4Me es nicht reservieren. Wähle ein anderes Tastenkürzel.', '{key} başka bir program tarafından kullanılıyor, bu yüzden Todo4Me onu ayıramadı. Başka bir kısayol seç.', '{key} ya lo usa otro programa, así que Todo4Me no pudo reservarlo. Elige otro atajo.'],
  'bg.notThisSystem': ['Not available on this system.', 'Auf diesem System nicht verfügbar.', 'Bu sistemde kullanılamıyor.', 'No disponible en este sistema.'],
  'bg.notInTests': ['Not available in test runs.', 'In Testläufen nicht verfügbar.', 'Test çalıştırmalarında kullanılamıyor.', 'No disponible en las ejecuciones de prueba.'],
  'bg.installedOnly': ['Only available in the installed app.', 'Nur in der installierten App verfügbar.', 'Yalnızca yüklü uygulamada kullanılabilir.', 'Solo disponible en la aplicación instalada.'],
  'bg.notPortable': ['Not available in the portable version (it runs from a temporary folder). Use the installer version.', 'In der portablen Version nicht verfügbar (sie läuft aus einem temporären Ordner). Nutze die Installer-Version.', 'Taşınabilir sürümde kullanılamıyor (geçici bir klasörden çalışır). Yükleyici sürümünü kullan.', 'No disponible en la versión portátil (se ejecuta desde una carpeta temporal). Usa la versión con instalador.'],

  // Updater
  'upd.missing': ['The update module is missing.', 'Das Update-Modul fehlt.', 'Güncelleme modülü eksik.', 'Falta el módulo de actualización.'],
  'upd.portable': ['The portable version cannot update itself. Download the new portable .exe or use the installer version.', 'Die portable Version kann sich nicht selbst aktualisieren. Lade die neue portable .exe herunter oder nutze die Installer-Version.', 'Taşınabilir sürüm kendini güncelleyemez. Yeni taşınabilir .exe dosyasını indir veya yükleyici sürümünü kullan.', 'La versión portátil no puede actualizarse sola. Descarga el nuevo .exe portátil o usa la versión con instalador.'],
  'upd.installedOnly': ['Updates are only available in the installed app.', 'Updates sind nur in der installierten App verfügbar.', 'Güncellemeler yalnızca yüklü uygulamada kullanılabilir.', 'Las actualizaciones solo están disponibles en la aplicación instalada.'],
  'upd.noAuto': ['Automatic updates are not available on this system.', 'Automatische Updates sind auf diesem System nicht verfügbar.', 'Bu sistemde otomatik güncellemeler kullanılamıyor.', 'Las actualizaciones automáticas no están disponibles en este sistema.'],
  'upd.linuxPackage': ['Installed as a Linux package – updates come via the GitHub releases page: github.com/muelgerhbf/todo4me/releases/latest', 'Als Linux-Paket installiert – Updates gibt es auf der GitHub-Releases-Seite: github.com/muelgerhbf/todo4me/releases/latest', 'Linux paketi olarak kurulu – güncellemeler GitHub sürümler sayfasından gelir: github.com/muelgerhbf/todo4me/releases/latest', 'Instalado como paquete de Linux: las actualizaciones llegan desde la página de versiones de GitHub: github.com/muelgerhbf/todo4me/releases/latest'],
  'upd.offline': ['No connection to the update server. Check your internet connection — Todo4Me will try again later.', 'Keine Verbindung zum Update-Server. Prüfe deine Internetverbindung – Todo4Me versucht es später erneut.', 'Güncelleme sunucusuna bağlanılamıyor. İnternet bağlantını kontrol et — Todo4Me daha sonra yeniden deneyecek.', 'Sin conexión con el servidor de actualizaciones. Comprueba tu conexión a internet: Todo4Me lo intentará de nuevo más tarde.'],
  'upd.noInfo': ['No update information was found on the server yet.', 'Auf dem Server wurden noch keine Update-Informationen gefunden.', 'Sunucuda henüz güncelleme bilgisi bulunamadı.', 'Aún no se encontró información de actualización en el servidor.'],
  'upd.unverified': ['The downloaded update could not be verified and was discarded. Please try again later.', 'Das heruntergeladene Update konnte nicht überprüft werden und wurde verworfen. Bitte versuche es später erneut.', 'İndirilen güncelleme doğrulanamadı ve atıldı. Lütfen daha sonra yeniden dene.', 'No se pudo verificar la actualización descargada y se descartó. Inténtalo de nuevo más tarde.'],
  'upd.disk': ['Not enough disk space to download the update.', 'Nicht genug Speicherplatz, um das Update herunterzuladen.', 'Güncellemeyi indirmek için yeterli disk alanı yok.', 'No hay espacio suficiente en disco para descargar la actualización.'],
  'upd.permission': ['The update could not be installed (no permission). Close Todo4Me and run the latest setup file manually.', 'Das Update konnte nicht installiert werden (keine Berechtigung). Schließe Todo4Me und führe die neueste Setup-Datei manuell aus.', 'Güncelleme yüklenemedi (izin yok). Todo4Me’yi kapat ve en son kurulum dosyasını elle çalıştır.', 'No se pudo instalar la actualización (sin permiso). Cierra Todo4Me y ejecuta manualmente el último archivo de instalación.'],
  'upd.failed': ['The update failed: {msg}', 'Das Update ist fehlgeschlagen: {msg}', 'Güncelleme başarısız oldu: {msg}', 'La actualización falló: {msg}'],
  'upd.noneReady': ['No update is ready to install.', 'Es ist kein Update zur Installation bereit.', 'Yüklenmeye hazır bir güncelleme yok.', 'No hay ninguna actualización lista para instalar.'],
  'upd.noPkexec': ['Automatic installation needs "pkexec" (polkit), which was not found. Install the update manually: download the .deb / .rpm from github.com/muelgerhbf/todo4me/releases/latest', 'Die automatische Installation benötigt „pkexec“ (polkit), das nicht gefunden wurde. Installiere das Update manuell: lade die .deb- / .rpm-Datei von github.com/muelgerhbf/todo4me/releases/latest herunter', 'Otomatik kurulum için bulunamayan "pkexec" (polkit) gerekiyor. Güncellemeyi elle kur: .deb / .rpm dosyasını github.com/muelgerhbf/todo4me/releases/latest adresinden indir', 'La instalación automática necesita "pkexec" (polkit), que no se encontró. Instala la actualización manualmente: descarga el .deb / .rpm desde github.com/muelgerhbf/todo4me/releases/latest'],
  'upd.noTool': ['No package manager was found to install the update. Install it manually from github.com/muelgerhbf/todo4me/releases/latest', 'Es wurde keine Paketverwaltung zum Installieren des Updates gefunden. Installiere es manuell von github.com/muelgerhbf/todo4me/releases/latest', 'Güncellemeyi kurmak için bir paket yöneticisi bulunamadı. github.com/muelgerhbf/todo4me/releases/latest adresinden elle kur', 'No se encontró ningún gestor de paquetes para instalar la actualización. Instálala manualmente desde github.com/muelgerhbf/todo4me/releases/latest'],
  'upd.installing': ['Installing the update… A system password prompt will appear — enter your password to continue.', 'Update wird installiert … Es erscheint eine Passwortabfrage des Systems – gib dein Passwort ein, um fortzufahren.', 'Güncelleme kuruluyor… Sistem parola penceresi açılacak — devam etmek için parolanı gir.', 'Instalando la actualización… Aparecerá una solicitud de contraseña del sistema: introduce tu contraseña para continuar.'],
  'upd.authCancelled': ['Update not installed — the password prompt was cancelled. You can try again.', 'Update nicht installiert – die Passwortabfrage wurde abgebrochen. Du kannst es erneut versuchen.', 'Güncelleme kurulmadı — parola penceresi iptal edildi. Yeniden deneyebilirsin.', 'Actualización no instalada: se canceló la solicitud de contraseña. Puedes intentarlo de nuevo.'],
  'upd.authFailed': ['Update not installed — authorization failed (no authentication agent is running, or you are not allowed to install software). You can try again.', 'Update nicht installiert – die Autorisierung ist fehlgeschlagen (es läuft kein Authentifizierungsdienst, oder du darfst keine Software installieren). Du kannst es erneut versuchen.', 'Güncelleme kurulmadı — yetkilendirme başarısız oldu (çalışan bir kimlik doğrulama aracı yok ya da yazılım kurma iznin yok). Yeniden deneyebilirsin.', 'Actualización no instalada: falló la autorización (no hay un agente de autenticación en ejecución o no tienes permiso para instalar software). Puedes intentarlo de nuevo.'],
  'upd.installError': ['The update could not be installed (exit code {code}): {msg}', 'Das Update konnte nicht installiert werden (Exit-Code {code}): {msg}', 'Güncelleme kurulamadı (çıkış kodu {code}): {msg}', 'No se pudo instalar la actualización (código de salida {code}): {msg}'],

  // Calendar download (errors are shown in Settings → Calendars)
  'cal.enterAddress': ['Please enter a calendar address.', 'Bitte gib eine Kalenderadresse ein.', 'Lütfen bir takvim adresi gir.', 'Introduce la dirección de un calendario.'],
  'cal.tooLong': ['This address is too long.', 'Diese Adresse ist zu lang.', 'Bu adres çok uzun.', 'Esta dirección es demasiado larga.'],
  'cal.invalid': ['This is not a valid web address.', 'Das ist keine gültige Webadresse.', 'Bu geçerli bir web adresi değil.', 'Esta no es una dirección web válida.'],
  'cal.httpsOnly': ['Only secure calendar addresses (https:// or webcal://) are supported.', 'Es werden nur sichere Kalenderadressen (https:// oder webcal://) unterstützt.', 'Yalnızca güvenli takvim adresleri (https:// veya webcal://) desteklenir.', 'Solo se admiten direcciones de calendario seguras (https:// o webcal://).'],
  'cal.noCredentials': ['Addresses with a user name or password are not supported. Use the calendar\'s published (secret) ICS link.', 'Adressen mit Benutzername oder Passwort werden nicht unterstützt. Verwende den veröffentlichten (geheimen) ICS-Link des Kalenders.', 'Kullanıcı adı veya parola içeren adresler desteklenmez. Takvimin yayımlanmış (gizli) ICS bağlantısını kullan.', 'No se admiten direcciones con nombre de usuario o contraseña. Usa el enlace ICS publicado (secreto) del calendario.'],
  'cal.refused': ['The calendar server refused access ({code}). The link may have been reset or is not public.', 'Der Kalenderserver hat den Zugriff verweigert ({code}). Der Link wurde möglicherweise zurückgesetzt oder ist nicht öffentlich.', 'Takvim sunucusu erişimi reddetti ({code}). Bağlantı sıfırlanmış veya herkese açık olmayabilir.', 'El servidor del calendario denegó el acceso ({code}). Puede que el enlace se haya restablecido o no sea público.'],
  'cal.notFound': ['Calendar not found ({code}). The link may have been removed or reset.', 'Kalender nicht gefunden ({code}). Der Link wurde möglicherweise entfernt oder zurückgesetzt.', 'Takvim bulunamadı ({code}). Bağlantı kaldırılmış veya sıfırlanmış olabilir.', 'Calendario no encontrado ({code}). Puede que el enlace se haya eliminado o restablecido.'],
  'cal.busy': ['The calendar server is busy ({code}). Try again later.', 'Der Kalenderserver ist ausgelastet ({code}). Versuche es später erneut.', 'Takvim sunucusu meşgul ({code}). Daha sonra yeniden dene.', 'El servidor del calendario está ocupado ({code}). Inténtalo de nuevo más tarde.'],
  'cal.serverProblem': ['The calendar server has a problem ({code}). Try again later.', 'Der Kalenderserver hat ein Problem ({code}). Versuche es später erneut.', 'Takvim sunucusunda bir sorun var ({code}). Daha sonra yeniden dene.', 'El servidor del calendario tiene un problema ({code}). Inténtalo de nuevo más tarde.'],
  'cal.serverError': ['The calendar server answered with an error ({code}).', 'Der Kalenderserver hat mit einem Fehler geantwortet ({code}).', 'Takvim sunucusu bir hatayla yanıt verdi ({code}).', 'El servidor del calendario respondió con un error ({code}).'],
  'cal.certificate': ['The calendar server\'s security certificate is not valid.', 'Das Sicherheitszertifikat des Kalenderservers ist ungültig.', 'Takvim sunucusunun güvenlik sertifikası geçerli değil.', 'El certificado de seguridad del servidor del calendario no es válido.'],
  'cal.timeout': ['The calendar server did not answer in time.', 'Der Kalenderserver hat nicht rechtzeitig geantwortet.', 'Takvim sunucusu zamanında yanıt vermedi.', 'El servidor del calendario no respondió a tiempo.'],
  'cal.downloadFailed': ['The calendar could not be downloaded.', 'Der Kalender konnte nicht heruntergeladen werden.', 'Takvim indirilemedi.', 'No se pudo descargar el calendario.'],
  'cal.downloadFailedCode': ['The calendar could not be downloaded ({code}).', 'Der Kalender konnte nicht heruntergeladen werden ({code}).', 'Takvim indirilemedi ({code}).', 'No se pudo descargar el calendario ({code}).'],
  'cal.redirects': ['Too many redirects.', 'Zu viele Weiterleitungen.', 'Çok fazla yönlendirme.', 'Demasiadas redirecciones.'],
  'cal.interrupted': ['The download was interrupted.', 'Der Download wurde unterbrochen.', 'İndirme kesintiye uğradı.', 'La descarga se interrumpió.'],
};

let lang = 'en';

function setLanguage(l) {
  if (!LANGS.includes(l)) return false;
  lang = l;
  return true;
}

/** Text for the current language (English when missing); "{name}" placeholders are filled from params. */
function t(key, params) {
  const e = T[key];
  if (!e) return key;
  let s = e[LANGS.indexOf(lang)] || e[0];
  if (params) s = s.replace(/\{(\w+)\}/g, (m, n) => (params[n] != null ? String(params[n]) : m));
  return s;
}

module.exports = { t, setLanguage, LANGS, get language() { return lang; }, _table: T };
