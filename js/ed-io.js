/* Todo4Me — import/export module: registers the exporters (docx, html, txt, rtf) and the .docx importer.
 * Implementation: ed-io-zip.js, ed-io-common.js, ed-io-omml.js, ed-io-docx-*.js, ed-io-html.js. Docs: docs/EDITOR-EXTENSIONS.md 3.11. */
(function () {
  'use strict';
  const X = window.T4.edx;
  const edio = window.T4.edio;
  const t = edio.common.t;

  /** Wrap a converter { blob, report } so the notes open in a dialog once the export has finished. */
  function exporter(id, fn) {
    return async (doc) => {
      const res = await fn(doc);
      if (res.report && res.report.length) {
        const off = X.events.on('after-export', (e) => {
          if (e.format !== id) return;
          off();
          setTimeout(() => X.report(t('rt.export', 'Export notes'), res.report), 150);
        });
        setTimeout(off, 30000);
      }
      return res.blob;
    };
  }
  const exportCommand = (ex) => X.commands.register('io.export-' + ex.ext, { label: () => t('cmd.export', 'Export as {format}', { format: X.text(ex) + ' (.' + ex.ext + ')' }), group: () => t('cmd.group', 'Import / Export'), icon: 'download', readonlyOk: true, order: 300,
    when: () => !!X.editor.current(), run: () => X.exporters.export(ex.id) });
  X.exporters.register({ id: 'io.docx', labelKey: 'edx.io.l.docx', label: 'Word document', ext: 'docx', icon: 'doc', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', run: exporter('io.docx', edio.docx.exportDocx) });
  X.exporters.register({ id: 'io.html', labelKey: 'edx.io.l.html', label: 'Web page (HTML)', ext: 'html', icon: 'code', mime: 'text/html', run: exporter('io.html', edio.html.exportHtml) });
  X.exporters.register({ id: 'io.txt', labelKey: 'edx.io.l.txt', label: 'Plain text', ext: 'txt', icon: 'doc', mime: 'text/plain', run: exporter('io.txt', edio.html.exportTxt) });
  X.exporters.register({ id: 'io.rtf', labelKey: 'edx.io.l.rtf', label: 'Rich Text Format', ext: 'rtf', icon: 'doc', mime: 'application/rtf', run: exporter('io.rtf', edio.html.exportRtf) });
  ['io.docx', 'io.html', 'io.txt', 'io.rtf'].forEach((id) => exportCommand(X.exporters.get(id)));
  X.importers.register({ id: 'io.docx', exts: ['docx'], accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', run: (file) => edio.docx.importDocx(file) });
})();
