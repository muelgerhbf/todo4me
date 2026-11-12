/* Todo4Me — formula conversion for DOCX: KaTeX MathML -> OMML (export) and OMML -> LaTeX (import). T4.edio.omml */
(function () {
  'use strict';
  const edio = (window.T4.edio = window.T4.edio || {});
  const xe = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const NARY = '∑∏∐∫∬∭∮⋃⋂⋁⋀⨁⨂⨀';
  const FONT = '<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr>';
  const el = (n) => (n.nodeType === 1 ? n : null);
  const kids = (n) => Array.from(n.children);
  const ln = (n) => n.localName.toLowerCase();

  /* ---------- MathML -> OMML ---------- */
  function mrun(text, kind) {
    text = String(text).replace(/[⁡-⁤​]/g, '');
    if (!text) return '';
    const pr = kind === 'nor' ? '<m:rPr><m:nor/></m:rPr>' : kind === 'p' ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : '';
    return '<m:r>' + pr + FONT + '<m:t xml:space="preserve">' + xe(text) + '</m:t></m:r>';
  }
  const isNary = (n) => {
    if (!n || n.nodeType !== 1) return false;
    const t = ln(n);
    if (!/^(msub|msup|msubsup|munder|mover|munderover)$/.test(t)) return false;
    const b = n.children[0];
    return !!b && ln(b) === 'mo' && b.textContent.length === 1 && NARY.includes(b.textContent);
  };
  function narySub(n, rest) {
    const t = ln(n), k = kids(n);
    const chr = k[0].textContent;
    let sub = '', sup = '';
    if (/^(msub|munder)$/.test(t)) sub = conv(k[1]);
    else if (/^(msup|mover)$/.test(t)) sup = conv(k[1]);
    else { sub = conv(k[1]); sup = conv(k[2]); }
    const lim = /^(munder|mover|munderover)$/.test(t) ? 'undOvr' : 'subSup';
    return '<m:nary><m:naryPr><m:chr m:val="' + xe(chr) + '"/><m:limLoc m:val="' + lim + '"/>' + (sub ? '' : '<m:subHide m:val="1"/>') + (sup ? '' : '<m:supHide m:val="1"/>') + '</m:naryPr><m:sub>' + sub + '</m:sub><m:sup>' + sup + '</m:sup><m:e>' + rest + '</m:e></m:nary>';
  }
  function row(nodes) {
    let out = '';
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (isNary(n)) {
        const nx = nodes[i + 1];
        out += narySub(n, nx ? conv(nx) : '');
        if (nx) i++;
      } else out += conv(n);
    }
    return out;
  }
  const E = (tag, inner) => '<m:' + tag + '>' + inner + '</m:' + tag + '>';
  function conv(n) {
    if (!n) return '';
    if (n.nodeType === 3) return mrun(n.nodeValue);
    if (n.nodeType !== 1) return '';
    const t = ln(n), k = kids(n);
    switch (t) {
      case 'math': case 'semantics': return t === 'semantics' ? row(k.filter((c) => ln(c) !== 'annotation' && ln(c) !== 'annotation-xml')) : row(k);
      case 'annotation': case 'annotation-xml': return '';
      case 'mrow': case 'mstyle': case 'mpadded': case 'mphantom': case 'menclose': case 'merror': {
        if (t === 'mrow' && k.length >= 2 && ln(k[0]) === 'mo' && ln(k[k.length - 1]) === 'mo' && k[0].getAttribute('fence') === 'true' && k[k.length - 1].getAttribute('fence') === 'true') {
          return '<m:d><m:dPr><m:begChr m:val="' + xe(k[0].textContent) + '"/><m:endChr m:val="' + xe(k[k.length - 1].textContent) + '"/></m:dPr>' + E('e', row(k.slice(1, -1))) + '</m:d>';
        }
        return row(k);
      }
      case 'mi': { const s = n.textContent; return mrun(s, n.getAttribute('mathvariant') === 'normal' || s.length > 1 ? 'p' : ''); }
      case 'mn': return mrun(n.textContent, 'p');
      case 'mo': return mrun(n.textContent, 'p');
      case 'mtext': case 'ms': return mrun(n.textContent, 'nor');
      case 'mspace': return '';
      case 'msup': return isNary(n) ? narySub(n, '') : E('sSup', E('e', conv(k[0])) + E('sup', conv(k[1])));
      case 'msub': return isNary(n) ? narySub(n, '') : E('sSub', E('e', conv(k[0])) + E('sub', conv(k[1])));
      case 'msubsup': return isNary(n) ? narySub(n, '') : E('sSubSup', E('e', conv(k[0])) + E('sub', conv(k[1])) + E('sup', conv(k[2])));
      case 'mfrac': return E('f', (n.getAttribute('linethickness') === '0px' || n.getAttribute('linethickness') === '0' ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : '') + E('num', conv(k[0])) + E('den', conv(k[1])));
      case 'msqrt': return E('rad', '<m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>' + E('e', row(k)));
      case 'mroot': return E('rad', E('deg', conv(k[1])) + E('e', conv(k[0])));
      case 'munder': return isNary(n) ? narySub(n, '') : E('limLow', E('e', conv(k[0])) + E('lim', conv(k[1])));
      case 'mover': {
        if (isNary(n)) return narySub(n, '');
        if (n.getAttribute('accent') === 'true' && k[1] && k[1].textContent.length === 1) return E('acc', '<m:accPr><m:chr m:val="' + xe(k[1].textContent) + '"/></m:accPr>' + E('e', conv(k[0])));
        return E('limUpp', E('e', conv(k[0])) + E('lim', conv(k[1])));
      }
      case 'munderover': return isNary(n) ? narySub(n, '') : E('limUpp', E('e', E('limLow', E('e', conv(k[0])) + E('lim', conv(k[1])))) + E('lim', conv(k[2])));
      case 'mtable': return E('m', k.map((tr) => E('mr', kids(tr).map((td) => E('e', row(kids(td)))).join(''))).join(''));
      default: return k.length ? row(k) : mrun(n.textContent);
    }
  }
  /** KaTeX output (string with a <math>) → OMML inner (m:oMath content) or null. */
  function mathmlToOmml(html) {
    const doc = new DOMParser().parseFromString('<!doctype html><body>' + html, 'text/html');
    const math = doc.querySelector('math');
    if (!math) return null;
    const out = conv(math);
    return out || null;
  }

  /* ---------- OMML -> LaTeX ---------- */
  const SYM = { α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\epsilon', ζ: '\\zeta', η: '\\eta', θ: '\\theta', λ: '\\lambda', μ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi', ρ: '\\rho', σ: '\\sigma', τ: '\\tau', φ: '\\phi', χ: '\\chi', ψ: '\\psi', ω: '\\omega', Γ: '\\Gamma', Δ: '\\Delta', Θ: '\\Theta', Λ: '\\Lambda', Ξ: '\\Xi', Π: '\\Pi', Σ: '\\Sigma', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega',
    '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '±': '\\pm ', '∓': '\\mp ', '×': '\\times ', '÷': '\\div ', '·': '\\cdot ', '∞': '\\infty ', '→': '\\to ', '←': '\\leftarrow ', '⇒': '\\Rightarrow ', '⇔': '\\Leftrightarrow ', '≈': '\\approx ', '∈': '\\in ', '∉': '\\notin ', '⊂': '\\subset ', '⊆': '\\subseteq ', '∪': '\\cup ', '∩': '\\cap ', '∂': '\\partial ', '∇': '\\nabla ', '∀': '\\forall ', '∃': '\\exists ', '−': '-', '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∮': '\\oint', '…': '\\ldots ', '′': "'" };
  const sy = (s) => Array.from(s).map((c) => SYM[c] || (c === '{' || c === '}' || c === '#' || c === '%' || c === '&' || c === '_' ? '\\' + c : c === '\\' ? '\\backslash ' : c)).join('');
  const ACC = { '^': 'hat', '̂': 'hat', '~': 'tilde', '̃': 'tilde', '¯': 'bar', '̅': 'bar', '→': 'vec', '⃗': 'vec', '˙': 'dot', '̇': 'dot' };
  function child(n, name) { return Array.from(n.children).find((c) => c.localName === name) || null; }
  function attrVal(n) { const v = n && n.getAttribute ? (n.getAttribute('m:val') || n.getAttribute('val')) : null; return v; }
  function pr(n, pn, cn) { const p = child(n, pn); const c = p && child(p, cn); return c ? attrVal(c) : null; }
  const grp = (s) => (s.length === 1 ? s : '{' + s + '}');
  function tex(n) {
    if (!n) return '';
    if (n.nodeType === 3) return '';
    if (n.nodeType !== 1) return '';
    const ln2 = n.localName, ch = Array.from(n.children);
    const sub = (name) => tex(child(n, name));
    const all = () => ch.map(tex).join('');
    switch (ln2) {
      case 'r': { const t = ch.filter((c) => c.localName === 't').map((c) => c.textContent).join(''); const nor = child(n, 'rPr') && child(child(n, 'rPr'), 'nor'); const s = sy(t); return nor ? '\\text{' + t.replace(/[{}\\]/g, '') + '}' : /^[A-Za-z]{2,}$/.test(t) ? '\\mathrm{' + t + '}' : s; }
      case 'f': return pr(n, 'fPr', 'type') === 'noBar' ? '\\binom{' + sub('num') + '}{' + sub('den') + '}' : '\\frac{' + sub('num') + '}{' + sub('den') + '}';
      case 'sSup': return grp(sub('e')) + '^{' + sub('sup') + '}';
      case 'sSub': return grp(sub('e')) + '_{' + sub('sub') + '}';
      case 'sSubSup': return grp(sub('e')) + '_{' + sub('sub') + '}^{' + sub('sup') + '}';
      case 'rad': return pr(n, 'radPr', 'degHide') === '1' || !sub('deg') ? '\\sqrt{' + sub('e') + '}' : '\\sqrt[' + sub('deg') + ']{' + sub('e') + '}';
      case 'd': {
        const b = pr(n, 'dPr', 'begChr'), e = pr(n, 'dPr', 'endChr'), sep = pr(n, 'dPr', 'sepChr') || '|';
        const bb = b == null ? '(' : b, ee = e == null ? ')' : e;
        const part = (c) => (c === '' ? '.' : c === '{' ? '\\{' : c === '}' ? '\\}' : c === '⟨' ? '\\langle' : c === '⟩' ? '\\rangle' : c);
        return '\\left' + part(bb) + ch.filter((c) => c.localName === 'e').map(tex).join(sep) + '\\right' + part(ee);
      }
      case 'nary': {
        const chr = pr(n, 'naryPr', 'chr') || '∫';
        const s = sub('sub'), p = sub('sup');
        return (SYM[chr] || chr).trim() + (s ? '_{' + s + '}' : '') + (p ? '^{' + p + '}' : '') + ' ' + sub('e');
      }
      case 'acc': { const c = pr(n, 'accPr', 'chr') || '^'; return '\\' + (ACC[c] || 'hat') + '{' + sub('e') + '}'; }
      case 'bar': return '\\overline{' + sub('e') + '}';
      case 'func': return '\\operatorname{' + sub('fName') + '}' + ' ' + sub('e');
      case 'limLow': return '\\underset{' + sub('lim') + '}{' + sub('e') + '}';
      case 'limUpp': return '\\overset{' + sub('lim') + '}{' + sub('e') + '}';
      case 'm': return '\\begin{matrix}' + ch.filter((c) => c.localName === 'mr').map((r) => Array.from(r.children).filter((c) => c.localName === 'e').map(tex).join(' & ')).join(' \\\\ ') + '\\end{matrix}';
      case 'eqArr': return '\\begin{aligned}' + ch.filter((c) => c.localName === 'e').map(tex).join(' \\\\ ') + '\\end{aligned}';
      case 'rPr': case 'fPr': case 'dPr': case 'naryPr': case 'radPr': case 'accPr': case 'ctrlPr': return '';
      default: return all();
    }
  }
  /** m:oMath element → LaTeX string. */
  function ommlToTex(oMath) { return tex(oMath).replace(/\s+/g, ' ').trim().slice(0, 4000); }

  edio.omml = { mathmlToOmml, ommlToTex };
})();
