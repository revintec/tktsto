// TKTSTO first-pass recovery, version 2026-11-24.4.
// Identity mappings come from tktsto.2026-11-24_05-30-26.mac.json.
// Also verified against tktsto.2026-11-24_05-57-12.mac.json.
// Also checks tktsto.2026-11-24_06-24-49.mac.json and damaged live tab IDs.
// Verified against the live diagnostic exported at 06:34 on November 24.
// Preview always uses the CURRENT tree and Chrome tabs. Counts may change.
// Run in TKTSTO's SERVICE WORKER DevTools Console (chrome://extensions).
// First run: queryObjects((async () => {}).constructor)
// Right-click the resulting array -> Store as global variable (temp1, etc.).
// Then paste this entire file. It previews only. To commit:
//   await tktstoRecovery.apply()
// To undo immediately, while the session still matches:
//   await tktstoRecovery.undo()
// To download the saved pre-repair tree:
//   await tktstoRecovery.downloadBackup()
// No browser tab is opened, closed, moved, reloaded, or navigated.

void (async () => {
  'use strict';
  const SESSION_START = 1782236513300;
  const SOURCE_EXPORT = 1795469426184;
  const VERIFIED_EXPORT = 1795472689771;
  const VERSION = '2026-11-24.4';
  // The diagnostic identified this one null-ID entry after its tab vanished.
  // Preserve it as a saved link only if the live evidence still agrees below.
  const KNOWN_STALE_TAB = { id: '1m854zfyy--mac', ctime: 1795469328350,
    original: '1m84g10e2--mac', savedWindow: '1kvwryyv4-01-mac',
    restoredWindow: '1m854z49a--mac' };
  const GROUPS = /* RECOVERY_MANIFEST */ [
    { savedWindow: "1kvtvk5pz--mac", restoredWindow: "1m854z49m--mac", pairs: [
      ["1kysb1tfe--mac", "1m854zwjs--mac"],
      ["1m14w9pbz--mac", "1m854zwgy--mac"],
      ["1m6vraemn--mac", "1m854zwf4--mac"],
      ["1m6vra21y--mac", "1m854zwd9--mac"],
      ["1m154gymp--mac", "1m854zwbe--mac"],
      ["1m6h3964a--mac", "1m854zw9k--mac"],
      ["1m16sm1yw--mac", "1m854zw7t--mac"],
      ["1kxqkyxbs--mac", "1m854zw5h--mac"],
      ["1m5cbb8qz--mac", "1m854zw3c--mac"],
      ["1m61g48pg--mac", "1m854zw18--mac"],
      ["1m617vysz--mac", "1m854zvzd--mac"],
      ["1m7df3m0e--mac", "1m854zvxn--mac"],
      ["1m5j8h7ft--mac", "1m854zvvw--mac"],
      ["1m7ad73m0--mac", "1m854zvsz--mac"],
      ["1m5w9smpt--mac", "1m854zvr8--mac"],
    ] },
    { savedWindow: "1kvwryyv4-01-mac", restoredWindow: "1m854z49a--mac", pairs: [
      ["1m7ytcjqg--mac", "1m854zhtm--mac"],
      ["1m7ytccr3--mac", "1m854zhr8--mac"],
      ["1m7ytc8k5--mac", "1m854zhnw--mac"],
      ["1m7s4kryv--mac", "1m854zhj7--mac"],
      ["1m7yyket6--mac", "1m854zhfp--mac"],
      ["1m7cv46zf--mac", "1m854zhcm--mac"],
      ["1m7fmm0c2--mac", "1m854zh9x--mac"],
      ["1m7cy0gfs--mac", "1m854zh7k--mac"],
      ["1m7cmham8--mac", "1m854zh2g--mac"],
      ["1m62t9rmj--mac", "1m854zgz5--mac"],
      ["1m62te268--mac", "1m854zgv1--mac"],
      ["1m62s3h0f--mac", "1m854zgrv--mac"],
      ["1m36h9chn--mac", "1m854zgpf--mac"],
      ["1m2m5mp5x--mac", "1m854zgkt--mac"],
      ["1m3q0vhcp--mac", "1m854zgef--mac"],
      ["1m3ptzew6--mac", "1m854zgbw--mac"],
      ["1m27nkvw0--mac", "1m854zg90--mac"],
      ["1m7yqgage--mac", "1m854zg6t--mac"],
      ["1m849ya59--mac", "1m854zg42--mac"],
      ["1m7yqfzrv--mac", "1m854zg16--mac"],
      ["1m7ytcnxs--mac", "1m854zj3v--mac"],
      ["1m7ytcv3y--mac", "1m854zj75--mac"],
      ["1m7ytcwxq--mac", "1m854zj9y--mac"],
      ["1m7ytd72t--mac", "1m854zjd5--mac"],
      ["1m7yk01hx--mac", "1m854zjjs--mac"],
      ["1m7x1dpfy--mac", "1m854zjz9--mac"],
      ["1m7sf7h4j--mac", "1m854zk3v--mac"],
      ["1m7sf7r7e--mac", "1m854zk6e--mac"],
      ["1m7s4m20n--mac", "1m854zkah--mac"],
      ["1m7cmk30j--mac", "1m854zkdf--mac"],
      ["1m7b2gm3t--mac", "1m854zkfw--mac"],
      ["1m7b1mv4c--mac", "1m854zkjv--mac"],
      ["1m7b1n530--mac", "1m854zkn7--mac"],
      ["1m7b17sht--mac", "1m854zkqm--mac"],
      ["1m6z65fye--mac", "1m854zkvm--mac"],
      ["1m6z664bt--mac", "1m854zkya--mac"],
      ["1m6z66peg--mac", "1m854zm0m--mac"],
      ["1m6xnjg2j--mac", "1m854zm30--mac"],
      ["1m6xnjpb8--mac", "1m854zm59--mac"],
      ["1m60zbb2s--mac", "1m854zm8c--mac"],
      ["1m60nbcew--mac", "1m854zmf3--mac"],
      ["1m63gxeav--mac", "1m854zmqm--mac"],
      ["1m66gfgg5--mac", "1m854zmv3--mac"],
      ["1m6vjdgk7--mac", "1m854zmxw--mac"],
      ["1m6bg6wwm--mac", "1m854zn05--mac"],
      ["1m4tf3fsv--mac", "1m854zn2j--mac"],
      ["1m6ghxe8d--mac", "1m854zn4v--mac"],
      ["1m6ghxsg1--mac", "1m854zn75--mac"],
      ["1m6j6jmzf--mac", "1m854zn9r--mac"],
      ["1m6mqzhmj--mac", "1m854zndm--mac"],
      ["1m6mt2jcr--mac", "1m854znnz--mac"],
      ["1m7nafqz6--mac", "1m854zns3--mac"],
      ["1m7pchhcr--mac", "1m854znvy--mac"],
      ["1m7pmmr31--mac", "1m854znyj--mac"],
      ["1m7pj70hw--mac", "1m854zp1b--mac"],
      ["1m7nga7m5--mac", "1m854zp3s--mac"],
      ["1m7j926a3--mac", "1m854zp6z--mac"],
      ["1m7j9297s--mac", "1m854zp9k--mac"],
      ["1m84g10e2--mac", "1m854zfyy--mac"],
      ["1m7mf75gk--mac", "1m854zppn--mac"],
      ["1m7mj6j0h--mac", "1m854zpsr--mac"],
      ["1m7jbjhrv--mac", "1m854zpzk--mac"],
      ["1m7knvw79--mac", "1m854zq27--mac"],
      ["1m7knz2z7--mac", "1m854zq4w--mac"],
      ["1m7knz8fd--mac", "1m854zq7k--mac"],
      ["1m7vc0s4j--mac", "1m854zqa7--mac"],
      ["1m7vc1vmt--mac", "1m854zqce--mac"],
      ["1m7jbj98d--mac", "1m854zqey--mac"],
      ["1m6nkf6y1--mac", "1m854zqh5--mac"],
      ["1m77sppmj--mac", "1m854zqkc--mac"],
      ["1m77sgd71--mac", "1m854zqnk--mac"],
      ["1m77mwq1d--mac", "1m854zqqw--mac"],
      ["1m77nqzfm--mac", "1m854zqt9--mac"],
      ["1m77mwrr2--mac", "1m854zqwm--mac"],
      ["1m7q4g5s1--mac", "1m854zqz0--mac"],
      ["1kxck308e--mac", "1m854zr1a--mac"],
      ["1m7jsb9q7--mac", "1m854zr3h--mac"],
      ["1m7jq09yf--mac", "1m854zr71--mac"],
      ["1m7jtbkeh--mac", "1m854zr9d--mac"],
      ["1m6rbrktv--mac", "1m854zrbm--mac"],
      ["1m6tfbmde--mac", "1m854zrdw--mac"],
      ["1m6twrrrc--mac", "1m854zrg5--mac"],
      ["1m6tt2mdn--mac", "1m854zrjc--mac"],
      ["1m6tt31qa--mac", "1m854zrms--mac"],
      ["1m6xptp4a--mac", "1m854zrq7--mac"],
      ["1m6y8mq61--mac", "1m854zrtk--mac"],
      ["1m6y4d61s--mac", "1m854zrx3--mac"],
      ["1m6y4dape--mac", "1m854zs0f--mac"],
      ["1m6y4de1n--mac", "1m854zs37--mac"],
      ["1m6mxn3ey--mac", "1m854zs5t--mac"],
      ["1m35am2kk--mac", "1m854zs89--mac"],
      ["1kzhw6eg4--mac", "1m854zsan--mac"],
      ["1m136snsm--mac", "1m854zscz--mac"],
      ["1m7sqtm0w--mac", "1m854zsf9--mac"],
      ["1kwv1s620--mac", "1m854zshm--mac"],
      ["1kwv1sv84--mac", "1m854zskw--mac"],
      ["1kwkqapmg--mac", "1m854zspb--mac"],
      ["1kyy40p62--mac", "1m854zsrr--mac"],
      ["1kzbf9cef--mac", "1m854zsv7--mac"],
      ["1kzr908a4--mac", "1m854zsxp--mac"],
      ["1kzr90b7a--mac", "1m854zt09--mac"],
      ["1kzr90j43--mac", "1m854zt2x--mac"],
      ["1kzr90mh1--mac", "1m854zt5a--mac"],
      ["1kzvper9b--mac", "1m854zt85--mac"],
      ["1m05c4ab1--mac", "1m854ztaw--mac"],
      ["1m6dzv692--mac", "1m854ztdk--mac"],
      ["1m6dzvrt1--mac", "1m854ztfz--mac"],
      ["1m6dzvw3d--mac", "1m854ztjd--mac"],
      ["1m6dzw5j0--mac", "1m854ztmy--mac"],
      ["1m055twb8--mac", "1m854ztqr--mac"],
      ["1kz5a5myt--mac", "1m854ztte--mac"],
      ["1kz5a6jdf--mac", "1m854ztxf--mac"],
      ["1m0cwwf7e--mac", "1m854zv00--mac"],
      ["1m0cwwm7p--mac", "1m854zv2k--mac"],
      ["1m0c7yjkp--mac", "1m854zv52--mac"],
      ["1m5efh8mz--mac", "1m854zv7q--mac"],
      ["1kztq8g4v--mac", "1m854zvbf--mac"],
      ["1m4eceknr--mac", "1m854zve0--mac"],
      ["1kztq8x8a--mac", "1m854zvge--mac"],
      ["1m6gdkc40--mac", "1m854zvjy--mac"],
      ["1kvwryyvk-01-mac", "1m854zvnk--mac"],
      ["1m48zhy35--mac", "1m854zfw6--mac"],
      ["1m2tnrjrp--mac", "1m854zfrp--mac"],
      ["1m1ry1xnd--mac", "1m854zfnc--mac"],
      ["1m1ny7yj4--mac", "1m854zfk3--mac"],
      ["1m51adk05--mac", "1m854zfh1--mac"],
      ["1m704mhr2--mac", "1m854zfed--mac"],
      ["1m706reqj--mac", "1m854zf7w--mac"],
      ["1m72xyavb--mac", "1m854zf5t--mac"],
      ["1m7awp7by--mac", "1m854zf3r--mac"],
      ["1m74swktq--mac", "1m854zf18--mac"],
      ["1m74wx0s4--mac", "1m854zez1--mac"],
      ["1m74stf0d--mac", "1m854zewr--mac"],
      ["1m73av21m--mac", "1m854zetd--mac"],
      ["1m77907g7--mac", "1m854zen4--mac"],
      ["1m79an629--mac", "1m854zej3--mac"],
      ["1m79an4b8--mac", "1m854zefv--mac"],
      ["1m84rqefb--mac", "1m854zecf--mac"],
      ["1m84rqc2g--mac", "1m854ze9p--mac"],
      ["1m84rq9xc--mac", "1m854zdwa--mac"],
      ["1m84zc57t--mac", "1m854zdrx--mac"],
      ["1m84zc47g--mac", "1m854zddt--mac"],
      ["1m79amsqw--mac", "1m854zdaq--mac"],
    ] },
    { savedWindow: "1kvwryz5k--mac", restoredWindow: "1m854z27q--mac", pairs: [
      ["1m4580fza--mac", "1m854za41--mac"],
      ["1m4537j5w--mac", "1m854za1j--mac"],
      ["1m4537yew--mac", "1m854z9zg--mac"],
      ["1m3jcm8pk--mac", "1m854zafz--mac"],
      ["1m5d0qkp0--mac", "1m854zahz--mac"],
      ["1m45akfwv--mac", "1m854zam0--mac"],
      ["1m3h9g8k7--mac", "1m854zap5--mac"],
      ["1m3hx3811--mac", "1m854zar2--mac"],
      ["1m3hvzr2b--mac", "1m854zatd--mac"],
      ["1m3hrakfs--mac", "1m854zazb--mac"],
      ["1m3hpzgdk--mac", "1m854zb1v--mac"],
      ["1m3hq9v92--mac", "1m854zb4t--mac"],
      ["1m5aw87dq--mac", "1m854zb8x--mac"],
      ["1m5apd3s6--mac", "1m854zbbm--mac"],
      ["1m5aw6anc--mac", "1m854zbea--mac"],
      ["1m5apdhtz--mac", "1m854zbjc--mac"],
      ["1m3fafvkd--mac", "1m854zbms--mac"],
      ["1m1zysbmy--mac", "1m854zbs5--mac"],
      ["1m1znd7wc--mac", "1m854zbws--mac"],
      ["1m2j58tgf--mac", "1m854zc18--mac"],
      ["1m2jk9kc0--mac", "1m854zc4e--mac"],
      ["1m2jpsnmw--mac", "1m854zc88--mac"],
      ["1m2jqjs1n--mac", "1m854zcaa--mac"],
      ["1m2jq6dg4--mac", "1m854zceh--mac"],
      ["1m2jkbth2--mac", "1m854zch4--mac"],
      ["1m2jkc8na--mac", "1m854zcmq--mac"],
      ["1m2jkcz28--mac", "1m854zctc--mac"],
      ["1m1ddddh4--mac", "1m854zcx8--mac"],
      ["1m451awr9--mac", "1m854z9xe--mac"],
      ["1m44ydf64--mac", "1m854z9vf--mac"],
      ["1m44sc03m--mac", "1m854z9sh--mac"],
      ["1m3d2e2cw--mac", "1m854z9qp--mac"],
      ["1m3mypt5r--mac", "1m854z9nv--mac"],
      ["1m3mzwz49--mac", "1m854z9kz--mac"],
      ["1m45ksn44--mac", "1m854z9j2--mac"],
      ["1m45ks775--mac", "1m854z9fx--mac"],
      ["1m45krz9c--mac", "1m854z9e1--mac"],
      ["1m45krk7h--mac", "1m854z9be--mac"],
      ["1m45kvm8d--mac", "1m854z99e--mac"],
      ["1m45ms6xc--mac", "1m854z97h--mac"],
      ["1m46941kw--mac", "1m854z94c--mac"],
      ["1m469yas5--mac", "1m854z91t--mac"],
      ["1m469xzax--mac", "1m854z8z4--mac"],
      ["1m46pt9w6--mac", "1m854z8tq--mac"],
      ["1m46psrn7--mac", "1m854z7ta--mac"],
      ["1m46prttf--mac", "1m854z7mt--mac"],
      ["1m46prm5z--mac", "1m854z7jc--mac"],
      ["1m46pgz1k--mac", "1m854z7fm--mac"],
      ["1m462dt93--mac", "1m854z7db--mac"],
      ["1m44pnmeh--mac", "1m854z7ad--mac"],
      ["1m06qdkqk--mac", "1m854z77c--mac"],
      ["1kwhydhkg--mac", "1m854z74w--mac"],
      ["1kwhydf2m--mac", "1m854z72k--mac"],
      ["1m5sprgkz--mac", "1m854z70q--mac"],
      ["1m5sprdcd--mac", "1m854z6yw--mac"],
      ["1m5t26hwp--mac", "1m854z6wm--mac"],
      ["1m5sw4mxn--mac", "1m854z6te--mac"],
      ["1m5stad19--mac", "1m854z6rf--mac"],
      ["1m3rzt27g--mac", "1m854z6pd--mac"],
      ["1m3rvtevt--mac", "1m854z6m3--mac"],
      ["1m5hxyybp--mac", "1m854z6h4--mac"],
      ["1m5hz3s3k--mac", "1m854z6cn--mac"],
      ["1m5fmmxvb--mac", "1m854z654--mac"],
      ["1m48nbm1q--mac", "1m854z61x--mac"],
      ["1m48nghg2--mac", "1m854z5s4--mac"],
      ["1m48ng7w8--mac", "1m854z5p8--mac"],
      ["1m3wnfh00--mac", "1m854z55e--mac"],
      ["1m52edx8e--mac", "1m854z4ys--mac"],
      ["1m3zh15y5--mac", "1m854z4rd--mac"],
    ] },
    { savedWindow: "1m0tt6me1--mac", restoredWindow: "1m854z49p--mac", pairs: [
      ["1m7pt463n--mac", "1m8550186--mac"],
      ["1m7pt34f1--mac", "1m855015y--mac"],
      ["1m7pt2dv7--mac", "1m855013t--mac"],
      ["1m7pt227s--mac", "1m855011n--mac"],
      ["1m8008dmf--mac", "1m85500zg--mac"],
      ["1m80053gv--mac", "1m85500xe--mac"],
      ["1m8005ces--mac", "1m85500va--mac"],
      ["1m8007mxg--mac", "1m85500s7--mac"],
      ["1m802wdwt--mac", "1m85500q1--mac"],
      ["1m802xt5a--mac", "1m85500my--mac"],
      ["1m8038s6n--mac", "1m85500jt--mac"],
      ["1m8038b0k--mac", "1m85500gq--mac"],
      ["1m8037zb1--mac", "1m85500ed--mac"],
      ["1m803799p--mac", "1m85500c9--mac"],
      ["1m8037148--mac", "1m85500a8--mac"],
      ["1m84kewcj--mac", "1m8550082--mac"],
      ["1m84kednq--mac", "1m855005z--mac"],
      ["1m84ke3et--mac", "1m855003y--mac"],
      ["1m84kdzrw--mac", "1m855001v--mac"],
      ["1m84kdrwc--mac", "1m854zzzq--mac"],
      ["1m851p5wz--mac", "1m854zzxj--mac"],
      ["1m851p38k--mac", "1m854zzv1--mac"],
      ["1m851p1c2--mac", "1m854zzrz--mac"],
      ["1m851nz9x--mac", "1m854zzpx--mac"],
      ["1m851nmpp--mac", "1m854zzmv--mac"],
      ["1m851ndfg--mac", "1m854zzjt--mac"],
      ["1m851n9w2--mac", "1m854zzgj--mac"],
      ["1m4t09aa0--mac", "1m854zzee--mac"],
      ["1m4sk8c8r--mac", "1m854zzcd--mac"],
      ["1m4nb5gzn--mac", "1m854zzaf--mac"],
      ["1m4fzjkfg--mac", "1m854zz80--mac"],
      ["1m4fzhv2a--mac", "1m854zz60--mac"],
      ["1m4fzhfzw--mac", "1m854zz42--mac"],
      ["1m4fze1z7--mac", "1m854zz23--mac"],
      ["1m4fz1gh4--mac", "1m854zz02--mac"],
      ["1m49pb5tc--mac", "1m854zyy1--mac"],
      ["1m49pb23r--mac", "1m854zyw4--mac"],
      ["1m3q9cadw--mac", "1m854zyt6--mac"],
      ["1m32rtsts--mac", "1m854zyr9--mac"],
      ["1m3vtgtz0--mac", "1m854zyp8--mac"],
      ["1kvw1expe--mac", "1m854zymc--mac"],
      ["1m1ck33ft--mac", "1m854zyje--mac"],
      ["1m1enkc9y--mac", "1m854zygg--mac"],
      ["1m49jrqfc--mac", "1m854zyem--mac"],
      ["1m49jrd8v--mac", "1m854zycq--mac"],
      ["1m49mxc7b--mac", "1m854zy9y--mac"],
      ["1m4f83ftr--mac", "1m854zy6m--mac"],
      ["1m49kt6s1--mac", "1m854zy46--mac"],
      ["1m49ksp3y--mac", "1m854zy21--mac"],
      ["1m1enr5x5--mac", "1m854zxzj--mac"],
      ["1m1enp3yj--mac", "1m854zxxh--mac"],
      ["1m1g2b1dt--mac", "1m854zxvd--mac"],
      ["1m1g2baqp--mac", "1m854zxse--mac"],
      ["1m4wx4zxz--mac", "1m854zxqc--mac"],
      ["1m4wx4rhk--mac", "1m854zxnc--mac"],
      ["1m4wx4gsv--mac", "1m854zxka--mac"],
      ["1m4wx49j8--mac", "1m854zxg7--mac"],
      ["1m4wx5y1q--mac", "1m854zxdx--mac"],
      ["1m4wwc4yr--mac", "1m854zxaf--mac"],
      ["1m4v60tsj--mac", "1m854zx7w--mac"],
      ["1m2qy1jm5--mac", "1m854zx5s--mac"],
      ["1m2r1vd1r--mac", "1m854zx3s--mac"],
      ["1m2r1tz5x--mac", "1m854zx1g--mac"],
      ["1m74xfj4h--mac", "1m854zwzg--mac"],
      ["1m7wyf9qn--mac", "1m854zwwp--mac"],
      ["1m7s24y6g--mac", "1m854zwtr--mac"],
      ["1m7s24vys--mac", "1m854zwrr--mac"],
      ["1m7s28pnn--mac", "1m854zwpn--mac"],
      ["1m7psfxky--mac", "1m854zwmr--mac"],
    ] },
  ];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  assert(typeof chrome !== 'undefined' && chrome.runtime?.id
    && typeof document === 'undefined',
  'Use the TKTSTO service worker console, opened from chrome://extensions.');
  assert(!globalThis.tktstoRecovery?.busy, 'A recovery is already running.');
  assert(!globalThis.tktstoRecovery?.backupKey,
    'Recovery is already installed and has a rollback snapshot. Use tktstoRecovery.undo() instead of pasting again.');

  // queryObjects is a DevTools command that prints an array; it does NOT
  // return that array to JavaScript. "Store as global variable" supplies it.
  const backgrounds = new Set();
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(globalThis))) {
    if (!/^temp\d+$/.test(key) || !Array.isArray(descriptor.value)) continue;
    for (const value of descriptor.value) {
      if (typeof value !== 'function' || value.name !== 'emit') continue;
      const bg = Object.getOwnPropertyDescriptor(value, 'bkgd')?.value;
      if (bg?.tree?.db && bg.tree.bkgd === bg) backgrounds.add(bg);
    }
  }
  assert(backgrounds.size === 1,
    'Run queryObjects((async () => {}).constructor), then right-click its output array and choose Store as global variable. Paste this file again.');
  const bg = [...backgrounds][0];
  await bg.treeLoaded;
  const tree = bg.tree;
  assert(tree.root.ctime === SESSION_START && tree.cfg.clientId === 'mac',
    'This script belongs to a different TKTSTO session. Nothing was changed.');
  assert(typeof tree.db.saveNodes === 'function',
    'This TKTSTO build is unsupported. Nothing was changed.');
  const clone = value => JSON.parse(JSON.stringify(value));
  const state = () => clone(tree.serializeNodes());
  const children = node => node.nodes || [];
  const isTab = node => !!node.url && node.type !== 'window';
  const isPink = node => isTab(node) && !node.loaded && !!node.wasLoaded;
  let busy = false;
  let journal = null;

  function descendants(nodes, id) {
    const found = [];
    for (const child of children(nodes[id])) {
      found.push(child);
      found.push(...descendants(nodes, child));
    }
    return found;
  }

  function windowOf(nodes, id) {
    let node = nodes[id];
    while (node && node.id !== 'root') {
      if (node.type === 'window') return node.id;
      node = nodes[node.parent];
    }
    return null;
  }

  function validate(nodes, checkIds = true) {
    assert(nodes.root?.parent === 'root', 'Invalid tree root.');
    const seen = new Set();
    const tabs = new Set(), windows = new Set();
    const visit = id => {
      const node = nodes[id];
      assert(node?.id === id && !seen.has(id), `Missing, repeated, or cyclic node: ${id}`);
      seen.add(id);
      if (checkIds && node.loaded && (isTab(node) || node.type === 'window')) {
        const isWindow = node.type === 'window';
        const liveId = isWindow ? node.windowId : node.tabId;
        const used = isWindow ? windows : tabs;
        assert(Number.isInteger(liveId) && liveId >= 0 && !used.has(liveId), `Invalid or repeated browser ID at ${id}`);
        used.add(liveId);
        if (!isWindow) {
          const owner = nodes[windowOf(nodes, id)];
          assert(owner?.loaded && owner.windowId === node.windowId,
            `Tab/window attachment disagrees at ${id}`);
        }
      }
      for (const child of children(node)) {
        assert(nodes[child]?.parent === id, `Parent/child links disagree at ${child}`);
        visit(child);
      }
    };
    visit('root');
    assert(seen.size === Object.keys(nodes).length, 'The tree has unreachable nodes.');
  }

  function stamp(nodes) {
    // Focus, access times, and page resource state can change just by opening
    // DevTools. Structure, URLs, annotations, and browser identities may not.
    const volatile = new Set(['active', 'atime', 'mtime', 'discarded', 'frozen',
      'hidden', 'faviconUrl', 'geometry', 'windowState', 'browserRestoreToken']);
    return JSON.stringify(Object.keys(nodes).sort().map(id => [id,
      Object.keys(nodes[id]).sort().filter(k => !volatile.has(k))
        .map(k => [k, nodes[id][k]])]));
  }

  async function browserState() {
    const windows = await chrome.windows.getAll({ populate: true });
    const byWindow = new Map(windows.map(win => [win.id, win]));
    const byTab = new Map(windows.flatMap(win => (win.tabs || []).map(tab => [tab.id, tab])));
    const signature = JSON.stringify({
      windows: windows.map(win => [win.id, win.type, !!win.incognito])
        .sort((a, b) => a[0] - b[0]),
      tabs: [...byTab.values()]
        .map(tab => [tab.id, tab.windowId, tab.url, tab.pendingUrl, !!tab.pinned,
          !!tab.incognito, tab.index])
        .sort((a, b) => a[0] - b[0]) });
    return { byWindow, byTab, signature };
  }

  function reconcileLiveIds(raw, browser) {
    // Work on a copy only. Loaded flags can survive after their live tab ID
    // is lost or shared by another entry. Backups intentionally omit IDs,
    // so only Chrome's current state can establish a replacement identity.
    const nodes = clone(raw), repairs = [], savedEntries = [], issues = [];
    const windowOwners = new Map(), claims = new Map(), reserved = new Map();
    const unresolved = [];
    const issue = (node, reason, candidates = []) => issues.push({
      node: node.id, tabId: node.tabId ?? null, tabIdType: typeof node.tabId,
      windowId: node.windowId ?? null, url: node.url || '', reason,
      candidateTabIds: candidates.map(tab => tab.id) });
    const validId = id => Number.isInteger(id) && id >= 0;
    for (const node of Object.values(nodes)) {
      if (!node.loaded || node.type !== 'window') continue;
      const win = browser.byWindow.get(node.windowId);
      if (!validId(node.windowId) || !win || win.type !== 'normal'
        || !!win.incognito !== !!node.incognito) {
        issue(node, 'Loaded window has no verified live Chrome window');
      } else if (windowOwners.has(win.id)) {
        issue(node, `Window ID is also claimed by ${windowOwners.get(win.id)}`);
      } else windowOwners.set(win.id, node.id);
    }
    const agrees = (node, tab) => {
      const owner = nodes[windowOf(nodes, node.id)];
      return !!tab && !!owner?.loaded && windowOwners.get(owner.windowId) === owner.id
        && tab.windowId === owner.windowId && (tab.pendingUrl || tab.url) === node.url
        && !!tab.incognito === !!node.incognito
        && tree.nodes[node.id].isPinned() === !!tab.pinned;
    };
    const attach = (node, tab, reason) => {
      reserved.set(tab.id, node.id);
      if (node.tabId === tab.id && node.windowId === tab.windowId) return;
      repairs.push({ node: node.id, oldTabId: node.tabId ?? null, tabId: tab.id,
        oldWindowId: node.windowId ?? null, windowId: tab.windowId, reason });
      node.tabId = tab.id;
      node.windowId = tab.windowId;
    };
    for (const node of Object.values(nodes)) {
      if (!node.loaded || !isTab(node)) continue;
      const owner = nodes[windowOf(nodes, node.id)];
      if (!owner?.loaded || windowOwners.get(owner.windowId) !== owner.id) {
        issue(node, 'The containing window has no verified live identity');
        continue;
      }
      if (!validId(node.tabId) || !browser.byTab.has(node.tabId)) {
        unresolved.push(node);
        continue;
      }
      if (!claims.has(node.tabId)) claims.set(node.tabId, []);
      claims.get(node.tabId).push(node);
    }
    // Keep verified existing owners first. A duplicate ID can be repaired
    // only if exactly one claimant agrees with Chrome about that tab.
    for (const [tabId, owners] of claims) {
      const tab = browser.byTab.get(tabId);
      const matching = owners.filter(node => agrees(node, tab));
      if (matching.length !== 1) {
        for (const node of owners) issue(node, matching.length > 1
          ? 'Multiple entries agree on the same tab ID; ownership is ambiguous'
          : 'Chrome and TKTSTO disagree about this existing tab ID', [tab]);
        continue;
      }
      attach(matching[0], tab, 'Verified tab; corrected its stored window ID');
      for (const node of owners) if (node !== matching[0]) unresolved.push(node);
    }
    const options = new Map(), contenders = new Map();
    for (const node of unresolved) {
      const candidates = [...browser.byTab.values()]
        .filter(tab => !reserved.has(tab.id) && agrees(node, tab));
      options.set(node.id, candidates);
      for (const tab of candidates)
        contenders.set(tab.id, (contenders.get(tab.id) || 0) + 1);
    }
    const unmatched = [];
    for (const node of unresolved) {
      const candidates = options.get(node.id);
      if (!candidates.length) unmatched.push(node);
      else if (candidates.length !== 1 || contenders.get(candidates[0].id) !== 1)
        issue(node, 'More than one entry or tab could match; no identity was guessed', candidates);
      else attach(node, candidates[0], 'Unique unclaimed Chrome tab with exact URL and matching window/state');
    }
    for (const node of unmatched) {
      const known = KNOWN_STALE_TAB, original = nodes[known.original];
      // This is deliberately not a general rule for missing tab IDs. Every
      // actual normal-window tab must already have a verified owner. Check
      // both committed and pending URLs everywhere, including app windows.
      const canSaveKnownEntry = !issues.length && unmatched.length === 1
        && node.id === known.id && node.ctime === known.ctime
        && node.tabId === null && node.wasLoaded === false
        && !validId(tree.nodes[node.id].oldTabId) && !tree.nodes[node.id].tabClosedReason
        && windowOf(nodes, node.id) === known.restoredWindow
        && node.windowId === nodes[known.restoredWindow]?.windowId
        && original && !original.loaded && original.url === node.url
        && windowOf(nodes, original.id) === known.savedWindow
        && ![...browser.byTab.values()].some(tab => tab.url === node.url || tab.pendingUrl === node.url)
        && [...browser.byWindow.values()].filter(win => win.type === 'normal')
          .every(win => windowOwners.has(win.id) && (win.tabs || []).every(tab => reserved.has(tab.id)));
      if (!canSaveKnownEntry) {
        issue(node, 'No unclaimed Chrome tab has this exact URL, window, privacy, and pinned state');
        continue;
      }
      savedEntries.push({ node: node.id, original: original.id, title: node.title,
        oldTabId: null, action: 'Keep as saved link (grey)',
        reason: 'Diagnosed null-ID entry; URL absent from Chrome; all regular-window tabs already accounted for' });
      node.loaded = false;
      node.active = false;
      delete node.tabId;
      delete node.windowId;
      delete node.browserRestoreToken;
    }
    return { nodes, repairs, savedEntries, issues };
  }

  async function diagnosticData() {
    const nodes = state();
    const runtimeDetails = Object.fromEntries(Object.entries(tree.nodes).map(([id, node]) => [id, {
      tabIdType: typeof node.tabId, windowIdType: typeof node.windowId,
      oldTabId: node.oldTabId, tabClosedReason: node.tabClosedReason
    }]));
    const [browser, databaseNodes] = await Promise.all([browserState(), tree.db.loadAllNodes()]);
    let identity;
    try {
      validate(nodes, false);
      identity = reconcileLiveIds(nodes, browser);
    } catch (error) {
      identity = { repairs: [], savedEntries: [], issues: [{ reason: error.message }] };
    }
    return { version: VERSION, capturedAt: Date.now(),
      kind: 'tktsto-live-diagnostic', extensionId: chrome.runtime.id,
      extensionVersion: chrome.runtime.getManifest().version,
      issues: identity.issues, proposedIdentityRepairs: identity.repairs,
      proposedSavedEntries: identity.savedEntries,
      nodes, runtimeDetails, databaseNodes, browserWindows: [...browser.byWindow.values()] };
  }

  async function diagnose() {
    assert(!busy, 'Recovery is busy.');
    const report = await diagnosticData();
    api.diagnostics = report;
    console.table(report.issues);
    console.table(report.proposedIdentityRepairs);
    console.table(report.proposedSavedEntries);
    console.log('Read-only diagnostic. Download it with: await tktstoRecovery.downloadDiagnostics()');
    return { issues: report.issues, proposedIdentityRepairs: report.proposedIdentityRepairs,
      proposedSavedEntries: report.proposedSavedEntries };
  }

  async function downloadDiagnostics() {
    assert(!busy, 'Recovery is busy.');
    const report = await diagnosticData();
    api.diagnostics = report;
    return chrome.downloads.download({
      url: 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report)),
      filename: `tktsto-recovery-diagnostic-${report.capturedAt}.json`, saveAs: false });
  }

  function copyBrowserFields(node, browser, isWindow) {
    node.loaded = true;
    node.wasLoaded = false;
    node.windowId = isWindow ? browser.id : browser.windowId;
    node.active = !!(isWindow ? browser.focused : browser.active);
    node.incognito = !!browser.incognito;
    delete node.browserRestoreToken;
    if (isWindow) {
      node.geometry = [browser.width, browser.height, browser.left, browser.top];
      node.windowState = browser.state;
    } else {
      node.tabId = browser.id;
      node.url = browser.pendingUrl || browser.url;
      if (browser.title) node.title = browser.title.trim().replace(/\s+/g, ' ');
      node.discarded = !!browser.discarded;
      node.frozen = !!browser.frozen;
      node.hidden = !!browser.hidden;
      if (browser.favIconUrl) node.faviconUrl = browser.favIconUrl;
    }
  }

  function hasExtraMetadata(donor, original) {
    return ['label', 'note', 'bookmark', 'checkbox', 'marked'].some(key => {
      const value = donor[key];
      const meaningful = key === 'checkbox' ? value !== undefined && value !== null
        : !!value;
      return meaningful && value !== original[key];
    });
  }

  function plan(rawBefore, browser) {
    validate(rawBefore, false);
    const identity = reconcileLiveIds(rawBefore, browser);
    api.identityIssues = identity.issues;
    api.identityRepairs = identity.repairs;
    api.savedEntries = identity.savedEntries;
    if (identity.issues.length) {
      console.table(identity.issues);
      throw new Error(`Live tab identity needs review at ${identity.issues[0].node || 'root'}: ${identity.issues[0].reason}. No changes made. Run await tktstoRecovery.downloadDiagnostics().`);
    }
    const before = identity.nodes;
    validate(before);
    const after = clone(before);
    const mapping = new Map();
    const rows = [], matches = [], skipped = [];
    for (const group of GROUPS) {
      const target = before[group.savedWindow], donor = before[group.restoredWindow];
      if (!donor) {
        rows.push({ window: target?.label || group.savedWindow, pink: 0, grey: 0,
          kept: 0, status: 'Restored copy absent; unchanged' });
        continue;
      }
      assert(target?.type === 'window' && donor.type === 'window', 'An expected window is missing.');
      const win = browser.byWindow.get(donor.windowId);
      assert(donor.loaded && win?.type === 'normal', `Restored window is no longer open: ${donor.id}`);
      assert(!target.loaded, `Original window is already open: ${target.label || target.id}. Stop and review it.`);
      assert(!!target.incognito === !!win.incognito, 'Incognito status differs.');
      assert(!hasExtraMetadata(donor, target),
        `Restored window has new annotations: ${donor.id}. Preserve these before repairing.`);
      const donorIds = descendants(before, donor.id);
      assert(!donorIds.some(id => before[id].type === 'window'), 'A restored window now contains a nested window.');
      // A window-wide mismatch usually means the live session has moved on.
      for (const id of donorIds) {
        const node = before[id];
        if (!node.loaded || !isTab(node)) continue;
        const tab = browser.byTab.get(node.tabId);
        assert(tab?.windowId === win.id && (tab.pendingUrl || tab.url) === node.url,
          `Chrome and TKTSTO disagree at ${id}. Wait for loading to finish and preview again.`);
      }
      mapping.set(donor.id, target.id);
      copyBrowserFields(after[target.id], win, true);
      let pink = 0, grey = 0;
      for (const [originalId, restoredId] of group.pairs) {
        const original = before[originalId], restored = before[restoredId];
        if (!restored) {
          skipped.push({ original: originalId, restored: restoredId,
            reason: 'Restored entry no longer exists (closed or deleted)' });
          continue;
        }
        let reason;
        const tab = browser.byTab.get(restored.tabId);
        if (!original || windowOf(before, originalId) !== target.id
          || windowOf(before, restoredId) !== donor.id) reason = 'Entry was moved or removed';
        else if (identity.savedEntries.some(entry => entry.node === restoredId))
          reason = 'No live Chrome tab; stale entry preserved as a saved link';
        else if (!restored.loaded || !tab) reason = 'Restored tab was closed';
        else if (original.loaded || original.bookmark) reason = 'Original is open or is a bookmark';
        else if (original.url !== restored.url) reason = 'URL changed (exact match required)';
        else if (hasExtraMetadata(restored, original)) reason = 'Restored copy has new annotations';
        else if (tree.nodes[originalId].isPinned() !== !!tab.pinned) reason = 'Pinned state differs';
        if (reason) {
          skipped.push({ original: originalId, restored: restoredId, reason });
          continue;
        }
        mapping.set(restoredId, originalId);
        copyBrowserFields(after[originalId], tab, false);
        after[originalId].atime = restored.atime;
        if (isPink(original)) pink++; else grey++;
        matches.push({ original: originalId, restored: restoredId,
          state: isPink(original) ? 'pink' : 'grey', title: original.title, url: original.url });
      }
      rows.push({ window: target.label || target.id, pink, grey,
        kept: donorIds.length - pink - grey, status: 'Reconnect to original window' });
    }

    // Project the temporary tree onto the originals. Matched originals keep
    // their parents and children exactly. Any new/unmatched source subtree is
    // appended at its surviving parent, so no unique content is discarded.
    for (const node of Object.values(after)) {
      if (mapping.has(node.id)) continue;
      node.nodes = children(node).filter(id => !mapping.has(id));
    }
    for (const [removedId, retainedId] of mapping) {
      for (const child of children(before[removedId])) {
        if (mapping.has(child)) continue;
        after[child].parent = retainedId;
        after[retainedId].nodes.push(child);
      }
      delete after[removedId];
    }
    validate(after);
    const liveIds = nodes => Object.values(nodes).filter(n => n.loaded && isTab(n))
      .map(n => n.tabId).sort((a, b) => a - b).join(',');
    assert(liveIds(before) === liveIds(after), 'Repair would change the live tab set.');
    return { before: rawBefore, undoNodes: before, after, rows, matches, skipped,
      identityRepairs: identity.repairs,
      savedEntries: identity.savedEntries,
      removed: [...mapping.keys()],
      browserTabs: browser.byTab.size,
      liveTabs: Object.values(after).filter(n => n.loaded && isTab(n)).length,
      remainingPink: Object.values(after).filter(isPink).length };
  }

  function publishReport(result) {
    api.matches = result.matches;
    api.skipped = result.skipped;
    api.summary = result.rows;
    api.identityRepairs = result.identityRepairs;
    api.savedEntries = result.savedEntries;
    api.stats = { reconnected: result.matches.length, skipped: result.skipped.length,
      repairedIdentities: result.identityRepairs.length,
      savedStaleEntries: result.savedEntries.length, browserTabs: result.browserTabs,
      liveTabs: result.liveTabs, remainingPink: result.remainingPink,
      removedTreeEntries: result.removed.length };
  }

  async function preview() {
    assert(!busy, 'Recovery is busy.');
    const browser = await browserState();
    const result = plan(state(), browser);
    publishReport(result);
    console.log(`TKTSTO recovery ${VERSION}: current-session preview`);
    console.table(result.rows);
    if (result.identityRepairs.length) console.table(result.identityRepairs);
    if (result.savedEntries.length) console.table(result.savedEntries);
    if (result.skipped.length) console.table(result.skipped);
    console.log(`Preview only: ${result.matches.length} tabs reconnect; ${result.removed.length} redundant tree entries disappear; ${result.remainingPink} pink entries remain saved. No changes made.`);
    console.log(`All ${result.liveTabs} tracked live tabs are retained. Chrome reports ${result.browserTabs} tabs in total, including other window types. No Chrome tab is changed.`);
    console.log('Inspect tktstoRecovery.matches / .skipped. Apply with: await tktstoRecovery.apply()');
    return result.rows;
  }

  async function guarded(operation) {
    assert(!busy, 'Recovery is busy.');
    busy = true;
    const unlocks = [];
    let releaseGate, oldBackgroundReady, oldTreeReady;
    try {
      await bg.treeLoaded;
      assert(!bg.nodesLoading.length && !bg.windowsLoading.length && !bg.tabReorderInProgress,
        'TKTSTO is loading or moving tabs. Wait until it finishes.');
      // Match the extension's existing lock order; pending UI work drains
      // before tab creation/replacement are held.
      for (const mutex of [tree.onMessageMutex, tree.onTabCreatedMutex, tree.onTabReplacedMutex])
        unlocks.push(await mutex.lock());
      oldBackgroundReady = bg.treeLoaded;
      oldTreeReady = tree.treeLoaded;
      const gate = new Promise(resolve => { releaseGate = resolve; });
      bg.treeLoaded = gate;
      tree.treeLoaded = gate;
      // Let handlers which already passed the readiness check finish. New
      // browser events wait on the gate; tab updates also wait on the mutex.
      let previous = stamp(state()), stable = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const next = stamp(state());
        if (next === previous) { stable = true; break; }
        previous = next;
      }
      assert(stable, 'The tree is still changing. Wait and try again.');
      return await operation();
    } finally {
      if (releaseGate) {
        bg.treeLoaded = oldBackgroundReady;
        tree.treeLoaded = oldTreeReady;
        releaseGate();
      }
      for (const unlock of unlocks.reverse()) unlock();
      busy = false;
    }
  }

  function install(after) {
    const previous = tree.nodes;
    const next = {};
    for (const [id, dict] of Object.entries(after)) {
      const node = previous[id] || new tree.NodeClass(tree, null);
      node.fromDict(dict);
      // Never retain a recently-closed tab's old identity on an attachment.
      delete node.oldTabId;
      delete node.tabClosedReason;
      delete node.naturalLastOpened;
      delete node.naturalExternalRoot;
      next[id] = node;
    }
    for (const [id, node] of Object.entries(next)) {
      node.parent = next[after[id].parent];
      node.nodes = children(after[id]).map(child => next[child]);
    }
    tree.nodes = next;
    tree.root = next.root;
    tree.markedNodes = Object.values(next).filter(node => node.marked);
    for (const [id, node] of Object.entries(previous)) {
      if (next[id]) continue;
      node.parent = null;
      node.nodes = [];
      node.loaded = false;
      node.tabId = undefined;
      node.windowId = undefined;
    }
  }

  async function commit(before, after, reason) {
    const db = await tree.db.db;
    assert(stamp(state()) === stamp(before), 'Tree changed during preparation. Preview again.');
    const backupKey = `console-recovery-${reason}-${Date.now()}-${crypto.randomUUID()}`;
    const snapshot = { $schema: 'https://toykeeper.net/tktsto/session-backup-json-schema-v1',
      metadata: { exportDate: Date.now(), sessionStartDate: SESSION_START, clientId: 'mac',
        sourceExportDate: SOURCE_EXPORT, verifiedExportDate: VERIFIED_EXPORT,
        recoveryVersion: VERSION, recoveryReason: reason }, nodes: before };
    await chrome.storage.local.set({ isLatestSnapshotDirty: true });
    assert(stamp(state()) === stamp(before), 'Tree changed before saving. Preview again.');
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['Nodes', 'Snapshots'], 'readwrite');
      const nodes = tx.objectStore('Nodes');
      tx.onabort = () => reject(tx.error || new Error('Recovery transaction aborted; tree unchanged.'));
      tx.onerror = () => {}; // onabort reports the final transaction failure.
      tx.oncomplete = () => {
        // Same JS task as completion: events cannot observe half an install.
        install(after);
        resolve();
      };
      try {
        tx.objectStore('Snapshots').put({ key: backupKey, data: JSON.stringify(snapshot) });
        for (const [id, dict] of Object.entries(after)) {
          if (JSON.stringify(dict) !== JSON.stringify(before[id]))
            nodes.put({ key: id, data: JSON.stringify(dict) });
        }
        for (const id of Object.keys(before)) if (!after[id]) nodes.delete(id);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
    return { backupKey, snapshot };
  }

  async function refreshViews() {
    if (typeof tree.tree_browserRestored === 'function') {
      try { await chrome.runtime.sendMessage({ msg: 'tree_browserRestored' }); }
      catch { /* no sidebars open */ }
    }
    console.log('Close and reopen the TKTSTO sidebar to refresh its tree.');
  }

  async function apply() {
    assert(!journal, 'Already applied. Use undo() before applying again.');
    const outcome = await guarded(async () => {
      const browser = await browserState();
      const result = plan(state(), browser);
      assert(result.matches.length > 0, 'No eligible matches remain. Nothing changed.');
      const liveCheck = await browserState();
      assert(browser.signature === liveCheck.signature, 'Chrome tabs changed. Preview again.');
      const saved = await commit(result.before, result.after, 'before-apply');
      // Undo restores the previous organization with verified identities and
      // saved state for the diagnosed stale entry, without recreating corruption.
      journal = { ...saved, before: result.undoNodes, afterStamp: stamp(state()),
        browserSignature: browser.signature };
      publishReport(result);
      console.table(result.rows);
      if (result.identityRepairs.length) console.table(result.identityRepairs);
      if (result.savedEntries.length) console.table(result.savedEntries);
      if (result.skipped.length) console.table(result.skipped);
      console.log(`Reconnected ${result.matches.length} existing tabs. Kept ${result.remainingPink} unmatched pink entries. Rollback snapshot: ${saved.backupKey}`);
      return { reconnected: result.matches.length, remainingPink: result.remainingPink,
        liveTabs: result.liveTabs, skipped: result.skipped.length,
        repairedIdentities: result.identityRepairs.length,
        savedStaleEntries: result.savedEntries.length, browserTabs: result.browserTabs,
        removedTreeEntries: result.removed.length, backupKey: saved.backupKey };
    });
    await refreshViews();
    return outcome;
  }

  async function undo() {
    assert(journal, 'No repair from this console session to undo.');
    const outcome = await guarded(async () => {
      const browser = await browserState();
      assert(browser.signature === journal.browserSignature,
        'Tabs have opened, closed, moved, or navigated since repair. Automatic undo stopped to preserve newer work. The snapshot is still available.');
      assert(stamp(state()) === journal.afterStamp,
        'The tree has changed since repair. Automatic undo stopped to preserve newer work. The snapshot is still available.');
      const restored = clone(journal.before);
      for (const node of Object.values(restored)) {
        if (!node.loaded) continue;
        if (node.type === 'window') copyBrowserFields(node, browser.byWindow.get(node.windowId), true);
        else if (isTab(node)) copyBrowserFields(node, browser.byTab.get(node.tabId), false);
      }
      validate(restored);
      const saved = await commit(state(), restored, 'before-undo');
      journal = null;
      console.log('Repair undone. Browser tabs were kept open.');
      return { undone: true, backupKey: saved.backupKey };
    });
    await refreshViews();
    return outcome;
  }

  async function downloadBackup() {
    const snapshot = journal ? clone(journal.snapshot) : {
      $schema: 'https://toykeeper.net/tktsto/session-backup-json-schema-v1',
      metadata: { exportDate: Date.now(), sessionStartDate: SESSION_START, clientId: 'mac' },
      nodes: state() };
    for (const node of Object.values(snapshot.nodes))
      for (const key of ['tabId', 'windowId', 'oldTabId', 'marked', 'browserRestoreToken']) delete node[key];
    return chrome.downloads.download({
      url: 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(snapshot)),
      filename: `tktsto-before-console-recovery-${snapshot.metadata.exportDate}.json`, saveAs: false });
  }

  const api = { version: VERSION, preview, apply, undo, downloadBackup, diagnose, downloadDiagnostics,
    get busy() { return busy; }, get backupKey() { return journal?.backupKey || null; } };
  globalThis.tktstoRecovery = api;
  await preview();
})().catch(error => console.error('TKTSTO recovery stopped:', error));
