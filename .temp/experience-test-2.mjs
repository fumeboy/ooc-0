import { chromium } from 'playwright';

const TEMP_DIR = '/Users/zhangzhefu/x/ooc/user/.temp';
const URL = 'http://localhost:5173';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // ========== 探索 Stones 标签 ==========
  console.log('\n=== 探索 Stones 标签 ===');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // 点击 Stones 按钮
  await page.click('button:has-text("Stones")');
  await sleep(2000);
  await page.screenshot({ path: `${TEMP_DIR}/candy-11-stones-tab.png`, fullPage: true });
  const stonesText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log(`Stones 页面:\n${stonesText}`);

  // ========== 探索 World 标签 ==========
  console.log('\n=== 探索 World 标签 ===');
  await page.click('button:has-text("World")');
  await sleep(2000);
  await page.screenshot({ path: `${TEMP_DIR}/candy-12-world-tab.png`, fullPage: true });
  const worldText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log(`World 页面:\n${worldText}`);

  // ========== 场景 2 重试：从首页发消息给 supervisor ==========
  console.log('\n=== 场景 2 重试：从首页发消息 ===');
  await page.click('button:has-text("Flows")');
  await sleep(1000);

  // 在 welcome 页面的输入框输入消息
  const input = await page.waitForSelector('input[type="text"]', { timeout: 5000 });
  await input.fill('请简要介绍一下 OOC 的 G1 基因是什么？');
  await sleep(500);
  await page.screenshot({ path: `${TEMP_DIR}/candy-13-welcome-typed.png`, fullPage: true });

  // 点击发送按钮（纸飞机图标）
  const sendButtons = await page.$$('button');
  console.log(`找到 ${sendButtons.length} 个按钮`);
  for (const btn of sendButtons) {
    const html = await btn.evaluate(el => el.innerHTML);
    if (html.includes('svg') || html.includes('Send') || html.includes('send')) {
      const text = await btn.evaluate(el => el.innerText);
      const ariaLabel = await btn.evaluate(el => el.getAttribute('aria-label'));
      console.log(`按钮: text="${text}", aria="${ariaLabel}", html长度=${html.length}`);
    }
  }

  // 找到输入框旁边的按钮（发送按钮）
  const sendBtn = await page.evaluate(() => {
    const input = document.querySelector('input[type="text"]');
    if (!input) return null;
    // 找到输入框的父容器中的按钮
    const container = input.closest('form') || input.parentElement?.parentElement;
    if (!container) return null;
    const btns = container.querySelectorAll('button');
    return btns.length;
  });
  console.log(`输入框容器中的按钮数: ${sendBtn}`);

  // 直接点击发送按钮 - 尝试用 SVG 路径找
  try {
    // 找到包含 SVG 的按钮（纸飞机图标）
    const clicked = await page.evaluate(() => {
      const input = document.querySelector('input[type="text"]');
      if (!input) return 'no input';
      const form = input.closest('form');
      if (form) {
        const btn = form.querySelector('button');
        if (btn) {
          btn.click();
          return 'clicked form button';
        }
        // 尝试提交表单
        form.dispatchEvent(new Event('submit', { bubbles: true }));
        return 'submitted form';
      }
      // 找输入框附近的按钮
      const parent = input.parentElement;
      const btn = parent?.querySelector('button');
      if (btn) {
        btn.click();
        return 'clicked parent button';
      }
      return 'no button found';
    });
    console.log(`发送结果: ${clicked}`);
  } catch (e) {
    console.log(`发送失败: ${e.message}`);
  }

  await sleep(2000);
  await page.screenshot({ path: `${TEMP_DIR}/candy-14-after-send.png`, fullPage: true });
  const afterSendText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log(`发送后页面:\n${afterSendText}`);

  // 检查 URL 是否变化（是否跳转到了会话页面）
  console.log(`当前 URL: ${page.url()}`);

  // 如果跳转到了会话页面，等待响应
  if (page.url() !== URL + '/') {
    console.log('已跳转到会话页面，等待响应...');
    for (let i = 0; i < 30; i++) {
      await sleep(3000);
      const text = await page.evaluate(() => document.body.innerText.substring(0, 3000));
      await page.screenshot({ path: `${TEMP_DIR}/candy-15-waiting-${i}.png`, fullPage: true });

      // 检查是否还在加载
      if (!text.includes('加载中')) {
        console.log(`第 ${(i+1)*3} 秒，加载完成`);
        console.log(`页面内容:\n${text}`);
        break;
      }

      // 检查是否有回复
      if (text.includes('G1') || text.includes('万物皆对象')) {
        console.log(`第 ${(i+1)*3} 秒，检测到回复`);
        console.log(`页面内容:\n${text}`);
        break;
      }

      console.log(`第 ${(i+1)*3} 秒，仍在等待... (URL: ${page.url()})`);

      if (i === 29) {
        console.log('等待超时（90秒）');
        console.log(`最终页面内容:\n${text}`);
      }
    }
    await page.screenshot({ path: `${TEMP_DIR}/candy-16-final-response.png`, fullPage: true });
  }

  await browser.close();
  console.log('\n=== 补充测试完成 ===');
}

main().catch(e => {
  console.error('脚本执行失败:', e);
  process.exit(1);
});
