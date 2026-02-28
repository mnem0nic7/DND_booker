import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3000';
const DIR = '/tmp/screenshots';
let step = 0;

async function snap(page, name) {
  const path = `${DIR}/${++step}-${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(`  [${step}] ${path}`);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function clickByText(page, selector, text) {
  const els = await page.$$(selector);
  for (const el of els) {
    const t = await el.evaluate(e => e.textContent?.trim().toLowerCase() || '');
    if (t.includes(text.toLowerCase())) { await el.click(); return true; }
  }
  return false;
}

async function debugPage(page, label) {
  const url = page.url();
  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log(`  [DEBUG ${label}] URL: ${url} | Title: ${title}`);
  console.log(`  [DEBUG ${label}] Body: ${bodyText.replace(/\n/g, ' | ').slice(0, 200)}`);
}

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Log console messages from the browser
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [BROWSER] ${msg.text()}`);
  });

  const email = `ui${Date.now()}@test.com`;
  const password = 'UiTest123!';

  try {
    // 1. Register via UI (sets auth cookies)
    console.log('1. Registering...');
    await page.goto(`${BASE}/register`, { waitUntil: 'networkidle2' });
    await page.type('#displayName', 'UI Tester', { delay: 10 });
    await page.type('#email', email, { delay: 10 });
    await page.type('#password', password, { delay: 10 });
    await page.type('#confirmPassword', password, { delay: 10 });
    await clickByText(page, 'button', 'create account');
    await wait(3000);
    await debugPage(page, 'after-register');
    await snap(page, 'dashboard');

    // 2. Create project via UI
    console.log('2. Creating project...');
    // Click "+ New Project" button
    const clicked = await clickByText(page, 'button', 'new project');
    console.log(`  Clicked "New Project": ${clicked}`);
    await wait(1500);
    await debugPage(page, 'after-new-project');

    // Click "Skip — start with a blank project"
    const skipped = await clickByText(page, 'button', 'skip');
    console.log(`  Clicked "Skip": ${skipped}`);
    await wait(1000);
    await snap(page, 'project-details');
    await debugPage(page, 'after-skip');

    // Fill title using the exact input ID
    const titleInput = await page.$('#project-title');
    if (titleInput) {
      await titleInput.click({ clickCount: 3 }); // select any existing text
      await titleInput.type('Dragon Coast One-Shot', { delay: 10 });
      console.log('  Filled title via #project-title');
    } else {
      // Fallback: find by placeholder
      console.log('  #project-title not found, trying placeholder match...');
      const inputs = await page.$$('input');
      for (const input of inputs) {
        const ph = await input.evaluate(e => e.placeholder?.toLowerCase() || '');
        if (ph.includes('title') || ph.includes('project')) {
          await input.type('Dragon Coast One-Shot', { delay: 10 });
          console.log(`  Filled title via placeholder: ${ph}`);
          break;
        }
      }
    }

    // Click "Create Project" button
    await wait(500);
    const created = await clickByText(page, 'button', 'create project');
    console.log(`  Clicked "Create Project": ${created}`);

    // Wait for navigation to /projects/{id} (auto-navigate on creation)
    console.log('  Waiting for editor navigation...');
    await wait(4000);
    await debugPage(page, 'after-create');
    await snap(page, 'editor');

    // Verify we're on the editor page
    const editorUrl = page.url();
    if (!editorUrl.includes('/projects/')) {
      console.log('  WARNING: Not on editor page! Trying alternative navigation...');
      // If still on dashboard, try clicking the project card
      for (const card of await page.$$('[class*="cursor-pointer"]')) {
        const text = await card.evaluate(e => e.textContent || '');
        if (text.includes('Dragon Coast')) {
          await card.click();
          console.log('  Clicked project card');
          await wait(3000);
          break;
        }
      }
      await debugPage(page, 'after-card-click');
    }

    // 3. Configure AI
    console.log('3. Configuring AI...');
    // Click the AI Settings gear button
    const settingsBtn = await page.$('button[title="AI Settings"]');
    if (settingsBtn) {
      await settingsBtn.click();
      console.log('  Clicked AI Settings button');
    } else {
      console.log('  AI Settings button not found!');
      await debugPage(page, 'no-settings-btn');
    }
    await wait(1500);
    await snap(page, 'ai-settings-modal');

    // Select Ollama provider via radio button
    const ollamaRadio = await page.$('input[type="radio"][value="ollama"]');
    if (ollamaRadio) {
      await ollamaRadio.click();
      console.log('  Selected Ollama radio');
    } else {
      // Fallback: click label containing "ollama"
      await clickByText(page, 'label', 'ollama');
      console.log('  Clicked Ollama label');
    }
    await wait(500);

    // Fill Ollama URL
    const urlInput = await page.$('input[placeholder="http://localhost:11434"]');
    if (urlInput) {
      await urlInput.click({ clickCount: 3 });
      await urlInput.type('http://host.docker.internal:11434', { delay: 5 });
      console.log('  Filled Ollama URL');
    } else {
      console.log('  URL input not found by placeholder, trying fallback...');
      for (const input of await page.$$('input[type="text"]')) {
        const ph = await input.evaluate(e => e.placeholder?.toLowerCase() || '');
        if (ph.includes('http') || ph.includes('11434') || ph.includes('localhost')) {
          await input.click({ clickCount: 3 });
          await input.type('http://host.docker.internal:11434', { delay: 5 });
          console.log(`  Filled URL via placeholder: ${ph}`);
          break;
        }
      }
    }

    // Click "Connect & Load Models"
    const connected = await clickByText(page, 'button', 'connect');
    console.log(`  Clicked Connect: ${connected}`);
    await wait(6000);
    await snap(page, 'models-loaded');

    // Select model from dropdown
    const selectEl = await page.$('select');
    if (selectEl) {
      // List available options
      const options = await selectEl.evaluate(sel =>
        Array.from(sel.options).map(o => o.value)
      );
      console.log(`  Available models: ${options.join(', ')}`);
      // Try to select llama3.1:8b or first available
      const target = options.find(o => o.includes('llama3.1:8b')) || options.find(o => o && o !== '');
      if (target) {
        await selectEl.select(target);
        console.log(`  Selected model: ${target}`);
      }
    } else {
      console.log('  No select dropdown found!');
    }

    await wait(300);
    await clickByText(page, 'button', 'save');
    console.log('  Clicked Save');
    await wait(2000);
    await snap(page, 'ai-saved');

    // 4. Open AI Chat
    console.log('4. Opening AI chat...');
    const aiToggle = await page.$('button[title="Show AI assistant"]');
    if (aiToggle) {
      await aiToggle.click();
      console.log('  Clicked AI toggle');
    } else {
      // Try broader match
      for (const btn of await page.$$('button')) {
        const title = await btn.evaluate(e => e.getAttribute('title') || '');
        if (title.includes('AI assistant')) { await btn.click(); console.log(`  Clicked: ${title}`); break; }
      }
    }
    await wait(1500);
    await snap(page, 'chat-open');

    // 5. Send message
    console.log('5. Sending message...');
    const chatTA = await page.$('textarea[placeholder="Ask about your campaign..."]');
    const ta = chatTA || await page.$('textarea');
    if (ta) {
      await ta.click();
      await ta.type('Create a mysterious tavern keeper NPC and a cursed dagger they sell', { delay: 8 });
      await snap(page, 'typed');
      await page.keyboard.press('Enter');
      console.log('  Message sent!');

      // 6. Wait for AI response
      console.log('6. Waiting for AI response...');
      for (let i = 0; i < 120; i++) {
        await wait(2000);
        const pulsing = await page.$('.animate-pulse');
        if (!pulsing && i > 5) {
          console.log(`  Response complete after ~${(i+1)*2}s`);
          break;
        }
        if (i % 10 === 0) console.log(`  Still waiting... ${i*2}s`);
      }
      await wait(3000);

      // Scroll chat to bottom
      await page.evaluate(() => {
        document.querySelectorAll('.overflow-y-auto').forEach(a => a.scrollTop = a.scrollHeight);
      });
      await wait(1000);
      await snap(page, 'response-top');

      // Scroll again and capture bottom
      await page.evaluate(() => {
        document.querySelectorAll('.overflow-y-auto').forEach(a => a.scrollTop = a.scrollHeight);
      });
      await wait(500);
      await snap(page, 'response-bottom');

      // Debug: get the full assistant message text
      const assistantText = await page.evaluate(() => {
        const msgs = document.querySelectorAll('.justify-start .ai-markdown, .justify-start .prose');
        return Array.from(msgs).map(m => m.textContent?.slice(0, 500)).join('\n---\n');
      });
      console.log(`\n  [AI Response Preview]: ${assistantText?.slice(0, 400) || '(empty)'}`);

      // Check for Insert buttons
      const insertCount = await page.$$eval('button', btns =>
        btns.filter(b => b.textContent?.trim() === 'Insert').length
      );
      console.log(`\n  Found ${insertCount} Insert button(s)!`);

      // Also check for the purple block cards (bg-purple-50)
      const blockCards = await page.$$('.bg-purple-50');
      console.log(`  Found ${blockCards.length} block card(s) (bg-purple-50)`);

      if (insertCount > 0) {
        console.log('7. Inserting first block...');
        await clickByText(page, 'button', 'insert');
        await wait(2000);

        // Close chat to see the editor
        const hideBtn = await page.$('button[title="Hide AI assistant"]');
        if (hideBtn) await hideBtn.click();
        await wait(1000);
        await snap(page, 'inserted');
      }
    } else {
      console.log('  No textarea found!');
      await debugPage(page, 'no-textarea');
      await snap(page, 'no-textarea');
    }

    console.log('\nDone!');
  } catch (err) {
    console.error('ERROR:', err.message);
    await debugPage(page, 'error');
    await snap(page, 'error');
  } finally {
    await browser.close();
  }
}

run();
