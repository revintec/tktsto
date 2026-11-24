const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
module.exports = async function harness() {
  const extension = path.resolve(__dirname, '..');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'tktsto-structure-test-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || chromium.executablePath(), headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(() => typeof chrome);
  const cdp = await context.newCDPSession(context.pages()[0]);
  const target = (await cdp.send('Target.getTargets')).targetInfos.find(t => t.type === 'service_worker' && t.url === worker.url());
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let sequence = 0;
  const pending = new Map();
  cdp.on('Target.receivedMessageFromTarget', event => {
    const response = JSON.parse(event.message);
    if (response.id) { pending.get(response.id)?.(response); pending.delete(response.id); }
  });
  const send = async (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, resolve);
    cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject);
  });
  const ev = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.error) throw new Error(JSON.stringify(response.error));
    if (response.result.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text);
    return response.result.result.value;
  };
  await new Promise(resolve => setTimeout(resolve, 1000));
  const prototype = await send('Runtime.evaluate', { expression: 'Object.getPrototypeOf(async function(){})' });
  const objects = await send('Runtime.queryObjects', { prototypeObjectId: prototype.result.result.objectId });
  await send('Runtime.callFunctionOn', { objectId: objects.result.objects.objectId,
    functionDeclaration: 'function(){globalThis.realBg=this.find(f=>f.name==="emit"&&f.bkgd?.tree).bkgd;}' });
  const install = async (source, helper) => {
    await ev(source.replace('void (async () => {', '(async () => {')
      .replace(/\}\)\(\)\.catch\(error => console\.error\([^\n]+\)\);\s*$/, '})();'));
    return ev(`${helper}.stats`);
  };
  return { context, worker, cdp, ev, install, close: async () => {
    await cdp.send('Target.detachFromTarget', { sessionId }); await context.close();
    await fs.rm(profile, { recursive: true, force: true });
  } };
};
