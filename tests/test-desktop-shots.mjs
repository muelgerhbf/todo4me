export default async function (b) {
  await b.evaluate(`(async () => { T4.ui.run('load-sample'); await new Promise(r => setTimeout(r, 80)); document.querySelector('#confirm [data-confirm=yes]').click(); await new Promise(r => setTimeout(r, 80)); })()`);
  const clean = `document.querySelectorAll('.toast').forEach(t => t.remove())`;
  await b.evaluate(`location.hash = '#/dashboard'`); await b.sleep(400); await b.evaluate(clean);
  await b.shot('electron-dashboard', false);
  await b.evaluate(`location.hash = '#/settings'`); await b.sleep(400); await b.evaluate(clean + `; document.querySelectorAll('.settings__section')[6].scrollIntoView()`); await b.sleep(200);
  await b.shot('electron-settings', false);
}
