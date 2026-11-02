export default async function (b) {
  await b.viewport(1440, 900);
  await b.goto();
  await b.evaluate('localStorage.clear()');
  await b.reload();
  // Load sample data directly (bypasses the confirm dialog), dismiss toasts.
  await b.evaluate(`T4.store.mergeData(T4.storage.sanitize((function(){ return ${'null'} })() || {tasks:[]}).data); true`);
  await b.evaluate(`(async () => { T4.ui.run('load-sample'); await new Promise(r => setTimeout(r, 50)); document.querySelector('#confirm [data-confirm=yes]').click(); await new Promise(r => setTimeout(r, 50)); document.querySelectorAll('.toast').forEach(t => t.remove()); T4.store.updateSettings({ userName: 'Sam' }); })()`);
  const routes = (process.env.ROUTES || 'dashboard,inbox,tasks,today,upcoming,planner,plan,notes,focus,stats,settings').split(',');
  const clean = `document.querySelectorAll('.toast').forEach(t => t.remove())`;
  for (const theme of ['light', 'dark']) {
    await b.evaluate(`T4.store.updateSettings({ theme: '${theme}' }); T4.settings.applyAppearance(); ${clean}`);
    for (const r of routes) {
      await b.evaluate(`location.hash = '#/${r}'`); await b.sleep(250); await b.evaluate(clean);
      await b.shot(`desk-${theme}-${r}`);
    }
  }
  await b.evaluate(`T4.store.updateSettings({ theme: 'light' }); T4.settings.applyAppearance()`);
  // modal
  await b.evaluate(`location.hash = '#/today'`); await b.sleep(200);
  await b.evaluate(`document.querySelector('.task__body').click()`); await b.sleep(250);
  await b.shot('desk-light-editor', false);
  await b.evaluate(`T4.ui.closeModal()`);
  // tablet
  await b.viewport(820, 1100, true);
  for (const r of ['dashboard', 'planner']) { await b.evaluate(`location.hash = '#/${r}'`); await b.sleep(250); await b.evaluate(clean); await b.shot('tab-' + r); }
  // mobile
  await b.viewport(390, 844, true);
  for (const r of ['dashboard', 'tasks', 'planner', 'notes', 'focus', 'stats', 'settings']) {
    await b.evaluate(`location.hash = '#/${r}'`); await b.sleep(250); await b.evaluate(clean); await b.shot('mob-' + r);
  }
  await b.evaluate(`location.hash = '#/dashboard'`); await b.sleep(200);
  await b.evaluate(`T4.ui.run('open-sidebar')`); await b.sleep(350);
  await b.shot('mob-sidebar', false);
  await b.evaluate(`T4.ui.run('close-sidebar'); document.querySelector('main .task__body').click()`); await b.sleep(250);
  await b.shot('mob-editor', false);
  const overflow = await b.evaluate(`document.documentElement.scrollWidth > window.innerWidth`);
  console.log('mobile horizontal overflow:', overflow);
}
