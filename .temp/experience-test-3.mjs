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

  // 监听 console 和网络错误
  const consoleLogs = [];
  const networkErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warn') {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('requestfailed', req => {
    networkErrors.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });
  page.on('response', resp => {
    if (resp.status() >= 400) {
      networkErrors.push(`${resp.status()} ${resp.url()}`);
    }
  });

  // ========== 测试：点击 "Start a conversation" 然后发消息 ==========
  console.log('\n=== 测试：通过 "Start a conversation" 进入会话 ===');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // 点击 "Start a conversation with supervisor" 文本
  try {
    await page.click('text=Start a conversation with supervisor');
    console.log('点击了 "Start a conversation with supervisor"');
  } catch (e) {
    // 尝试其他方式
    const clicked = await page.evaluate(() => {
      const allEls = document.querySelectorAll('*');
      for (const el of allEls) {
        if (el.textContent?.includes('Start a conversation') && el.children.length === 0) {
          el.click();
          return el.textContent;
        }
      }
      return null;
    });
    console.log(`备选点击: ${clicked}`);
  }

  await sleep(3000);
  console.log(`当前 URL: ${page.url()}`);
  await page.screenshot({ path: `${TEMP_DIR}/candy-20-after-start-conv.png`, fullPage: true });

  const pageText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log(`页面内容:\n${pageText}`);

  // 检查是否有输入框
  const inputs = await page.evaluate(() => {
    const els = document.querySelectorAll('input, textarea');
    return Array.from(els).map(el => ({
      tag: el.tagName,
      type: el.type,
      placeholder: el.placeholder,
      value: el.value,
      disabled: el.disabled,
    }));
  });
  console.log(`输入框: ${JSON.stringify(inputs, null, 2)}`);

  // 如果有输入框，尝试发消息
  if (inputs.length > 0) {
    const selector = inputs[0].tag === 'TEXTAREA' ? 'textarea' : 'input';
    await page.fill(selector, '你好');
    await sleep(500);
    await page.screenshot({ path: `${TEMP_DIR}/candy-21-typed-hello.png`, fullPage: true });

    // 按 Enter 发送
    await page.keyboard.press('Enter');
    await sleep(2000);
    await page.screenshot({ path: `${TEMP_DIR}/candy-22-after-enter.png`, fullPage: true });

    const afterText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    console.log(`Enter 后页面:\n${afterText}`);
    console.log(`Enter 后 URL: ${page.url()}`);

    // 等待响应
    console.log('等待响应...');
    for (let i = 0; i < 40; i++) {
      await sleep(3000);
      const text = await page.evaluate(() => document.body.innerText.substring(0, 5000));

      if (i % 5 === 0) {
        await page.screenshot({ path: `${TEMP_DIR}/candy-23-waiting-${i}.png`, fullPage: true });
      }

      // 检查是否有回复（不只是用户消息）
      const lines = text.split('\n').filter(l => l.trim());
      const hasResponse = lines.some(l =>
        !l.includes('加载中') &&
        !l.includes('你好') &&
        !l.includes('supervisor') &&
        !l.includes('Oriented') &&
        !l.includes('Flows') &&
        !l.includes('Stones') &&
        !l.includes('World') &&
        !l.includes('SESSIONS') &&
        !l.includes('session_') &&
        !l.includes('index') &&
        !l.includes('objects') &&
        !l.includes('输入消息') &&
        !l.includes('Select') &&
        !l.includes('welcome') &&
        l.trim().length > 5
      );

      if (hasResponse) {
        console.log(`第 ${(i+1)*3} 秒，检测到新内容`);
        console.log(`页面内容:\n${text}`);
        await page.screenshot({ path: `${TEMP_DIR}/candy-24-response.png`, fullPage: true });
        break;
      }

      if (i % 10 === 9) {
        console.log(`第 ${(i+1)*3} 秒，仍在等待...`);
        console.log(`当前内容片段: ${text.substring(0, 200)}`);
      }

      if (i === 39) {
        console.log('等待超时（120秒）');
        console.log(`最终页面内容:\n${text}`);
        await page.screenshot({ path: `${TEMP_DIR}/candy-25-timeout.png`, fullPage: true });
      }
    }
  }

  // 输出收集到的错误
  console.log('\n=== 浏览器控制台错误 ===');
  consoleLogs.forEach(l => console.log(l));
  console.log('\n=== 网络错误 ===');
  networkErrors.forEach(l => console.log(l));

  await browser.close();
  console.log('\n=== 最终测试完成 ===');
}

main().catch(e => {
  console.error('脚本执行失败:', e);
  process.exit(1);
});
