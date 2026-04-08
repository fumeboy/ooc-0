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

  // ========== 场景 1：初次访问 ==========
  console.log('\n=== 场景 1：初次访问 ===');

  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(3000); // 等待 React 渲染
  const loadTime = Date.now() - t0;
  console.log(`页面加载时间: ${loadTime}ms`);

  await page.screenshot({ path: `${TEMP_DIR}/candy-01-homepage.png`, fullPage: true });
  console.log('截图: candy-01-homepage.png');

  // 获取页面标题和主要文本内容
  const title = await page.title();
  console.log(`页面标题: ${title}`);

  // 获取页面上可见的文本内容
  const bodyText = await page.evaluate(() => {
    return document.body.innerText.substring(0, 2000);
  });
  console.log(`页面文本内容:\n${bodyText}`);

  // 查找所有可点击的对象/链接
  const links = await page.evaluate(() => {
    const els = document.querySelectorAll('a, button, [role="button"], [data-clickable]');
    return Array.from(els).map(el => ({
      tag: el.tagName,
      text: el.innerText?.trim().substring(0, 100),
      href: el.getAttribute('href'),
    })).filter(l => l.text);
  });
  console.log(`可交互元素: ${JSON.stringify(links, null, 2)}`);

  // 查找对象列表
  const objectCards = await page.evaluate(() => {
    // 尝试多种选择器找到对象卡片
    const selectors = [
      '[class*="stone"]', '[class*="object"]', '[class*="card"]',
      '[class*="Stone"]', '[class*="Object"]', '[class*="Card"]',
      'li', '.item', '[data-stone]'
    ];
    const results = {};
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        results[sel] = Array.from(els).map(el => el.innerText?.trim().substring(0, 200));
      }
    }
    return results;
  });
  console.log(`对象卡片: ${JSON.stringify(objectCards, null, 2)}`);

  await sleep(1000);
  await page.screenshot({ path: `${TEMP_DIR}/candy-02-homepage-settled.png`, fullPage: true });

  // ========== 尝试找到并点击对象列表 ==========
  console.log('\n=== 探索导航 ===');

  // 查看页面结构
  const pageStructure = await page.evaluate(() => {
    const walk = (el, depth = 0) => {
      if (depth > 4) return '';
      const tag = el.tagName?.toLowerCase();
      const cls = el.className ? `.${String(el.className).split(' ').join('.')}` : '';
      const id = el.id ? `#${el.id}` : '';
      const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
        ? ` "${el.textContent?.trim().substring(0, 50)}"` : '';
      let result = '  '.repeat(depth) + `<${tag}${id}${cls}>${text}\n`;
      for (const child of el.children) {
        result += walk(child, depth + 1);
      }
      return result;
    };
    return walk(document.body).substring(0, 5000);
  });
  console.log(`页面结构:\n${pageStructure}`);

  // ========== 场景 2：与 sophia 对话 ==========
  console.log('\n=== 场景 2：与 sophia 对话 ===');

  // 先找到 sophia 对象并点击
  const sophiaLink = await page.evaluate(() => {
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      if (el.innerText?.toLowerCase().includes('sophia') &&
          (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'LI' || el.tagName === 'DIV')) {
        return {
          tag: el.tagName,
          text: el.innerText.trim().substring(0, 100),
          className: el.className,
        };
      }
    }
    return null;
  });
  console.log(`找到 sophia 元素: ${JSON.stringify(sophiaLink)}`);

  // 点击 sophia
  try {
    // 尝试多种方式找到并点击 sophia
    const clicked = await page.evaluate(() => {
      const allEls = document.querySelectorAll('*');
      for (const el of allEls) {
        const text = el.innerText?.toLowerCase() || '';
        if (text.includes('sophia') && !text.includes('\n') && text.length < 50) {
          el.click();
          return el.innerText;
        }
      }
      // 如果没找到精确匹配，找包含 sophia 的最小元素
      let best = null;
      let bestLen = Infinity;
      for (const el of allEls) {
        const text = el.innerText?.toLowerCase() || '';
        if (text.includes('sophia') && text.length < bestLen) {
          best = el;
          bestLen = text.length;
        }
      }
      if (best) {
        best.click();
        return best.innerText;
      }
      return null;
    });
    console.log(`点击了: ${clicked}`);

    await sleep(2000);
    await page.screenshot({ path: `${TEMP_DIR}/candy-03-sophia-page.png`, fullPage: true });

    // 查看 sophia 页面内容
    const sophiaPageText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    console.log(`Sophia 页面内容:\n${sophiaPageText}`);

  } catch (e) {
    console.log(`点击 sophia 失败: ${e.message}`);
  }

  // 找到输入框并发送消息
  try {
    // 查找输入框
    const inputInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
      return Array.from(inputs).map(el => ({
        tag: el.tagName,
        type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
        className: el.className,
        id: el.id,
      }));
    });
    console.log(`输入框: ${JSON.stringify(inputInfo, null, 2)}`);

    // 在输入框中输入消息
    const inputSelector = 'textarea, input[type="text"], [contenteditable="true"]';
    await page.waitForSelector(inputSelector, { timeout: 5000 });

    const message = '请简要介绍一下 OOC 的 G1 基因是什么？';
    await page.fill(inputSelector, message);
    await sleep(500);
    await page.screenshot({ path: `${TEMP_DIR}/candy-04-sophia-typed.png`, fullPage: true });
    console.log(`已输入消息: ${message}`);

    // 发送消息（按 Enter 或点击发送按钮）
    const t1 = Date.now();

    // 尝试找发送按钮
    const sendBtn = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        const text = btn.innerText?.toLowerCase() || '';
        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
        if (text.includes('send') || text.includes('发送') || ariaLabel.includes('send')) {
          return { text: btn.innerText, ariaLabel };
        }
      }
      return null;
    });

    if (sendBtn) {
      console.log(`找到发送按钮: ${JSON.stringify(sendBtn)}`);
      await page.click('button:has-text("发送"), button:has-text("Send"), button[aria-label*="send"]');
    } else {
      console.log('未找到发送按钮，尝试按 Enter');
      await page.keyboard.press('Enter');
    }

    const sendTime = Date.now() - t1;
    console.log(`发送操作耗时: ${sendTime}ms`);

    await sleep(1000);
    await page.screenshot({ path: `${TEMP_DIR}/candy-05-sophia-sent.png`, fullPage: true });

    // 等待响应，每 3 秒截图一次，最多等 60 秒
    console.log('等待 sophia 响应...');
    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      const currentText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
      await page.screenshot({ path: `${TEMP_DIR}/candy-06-sophia-waiting-${i}.png`, fullPage: true });

      // 检查是否有新的回复内容
      if (currentText.includes('G1') || currentText.includes('基因') || currentText.includes('万物皆对象') ||
          currentText.length > 500) {
        console.log(`第 ${(i+1)*3} 秒，检测到回复内容`);
        console.log(`当前页面内容:\n${currentText}`);
        break;
      }
      console.log(`第 ${(i+1)*3} 秒，仍在等待...`);

      if (i === 19) {
        console.log('等待超时（60秒），截取最终状态');
        console.log(`最终页面内容:\n${currentText}`);
      }
    }

    await page.screenshot({ path: `${TEMP_DIR}/candy-07-sophia-response.png`, fullPage: true });

  } catch (e) {
    console.log(`与 sophia 对话失败: ${e.message}`);
    await page.screenshot({ path: `${TEMP_DIR}/candy-error-sophia.png`, fullPage: true });
  }

  // ========== 场景 3：与 supervisor 对话 ==========
  console.log('\n=== 场景 3：与 supervisor 对话 ===');

  // 回到首页
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // 找到并点击 supervisor
  try {
    const clicked = await page.evaluate(() => {
      const allEls = document.querySelectorAll('*');
      let best = null;
      let bestLen = Infinity;
      for (const el of allEls) {
        const text = el.innerText?.toLowerCase() || '';
        if (text.includes('supervisor') && text.length < bestLen) {
          best = el;
          bestLen = text.length;
        }
      }
      if (best) {
        best.click();
        return best.innerText?.substring(0, 100);
      }
      return null;
    });
    console.log(`点击了 supervisor: ${clicked}`);

    await sleep(2000);
    await page.screenshot({ path: `${TEMP_DIR}/candy-08-supervisor-page.png`, fullPage: true });

    // 输入消息
    const inputSelector = 'textarea, input[type="text"], [contenteditable="true"]';
    await page.waitForSelector(inputSelector, { timeout: 5000 });
    await page.fill(inputSelector, '你好');
    await sleep(500);

    // 发送
    const t2 = Date.now();
    const sendBtn = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        const text = btn.innerText?.toLowerCase() || '';
        if (text.includes('send') || text.includes('发送')) {
          return true;
        }
      }
      return false;
    });

    if (sendBtn) {
      await page.click('button:has-text("发送"), button:has-text("Send")');
    } else {
      await page.keyboard.press('Enter');
    }

    console.log('已发送"你好"给 supervisor');

    // 等待响应
    for (let i = 0; i < 15; i++) {
      await sleep(3000);
      const currentText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
      await page.screenshot({ path: `${TEMP_DIR}/candy-09-supervisor-waiting-${i}.png`, fullPage: true });

      if (currentText.includes('你好') && currentText.split('你好').length > 2) {
        console.log(`第 ${(i+1)*3} 秒，检测到回复`);
        console.log(`页面内容:\n${currentText}`);
        break;
      }
      console.log(`第 ${(i+1)*3} 秒，等待 supervisor 响应...`);

      if (i === 14) {
        console.log('等待超时（45秒）');
        console.log(`最终页面内容:\n${currentText}`);
      }
    }

    await page.screenshot({ path: `${TEMP_DIR}/candy-10-supervisor-response.png`, fullPage: true });

  } catch (e) {
    console.log(`与 supervisor 对话失败: ${e.message}`);
    await page.screenshot({ path: `${TEMP_DIR}/candy-error-supervisor.png`, fullPage: true });
  }

  await browser.close();
  console.log('\n=== 体验测试完成 ===');
}

main().catch(e => {
  console.error('脚本执行失败:', e);
  process.exit(1);
});
