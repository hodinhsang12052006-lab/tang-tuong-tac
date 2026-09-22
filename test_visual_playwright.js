const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = path.join(__dirname, 'test_screenshots');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function runVisualCheck() {
  console.log('--- STARTING PLAYWRIGHT VISUAL CRO CHECK ---');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const fileUrl = 'file:///' + path.join(__dirname, 'public', 'index.html').replace(/\\/g, '/');
  console.log('Navigating to:', fileUrl);

  // 1. DESKTOP VIEWPORT 1920x1080
  console.log('\n[1/2] Testing Desktop 1920x1080...');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Full page screenshot
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_full.png'), fullPage: true });
  console.log('Saved: desktop_full.png');

  // Hero Card Screenshot
  const heroCard = await page.$('.hero-dashboard-card');
  if (heroCard) {
    await heroCard.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_hero_card.png') });
    console.log('Saved: desktop_hero_card.png');
  }

  // Hero Section Screenshot
  const heroSection = await page.$('section#hero') || await page.$('.hero-section');
  if (heroSection) {
    await heroSection.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_hero_section.png') });
    console.log('Saved: desktop_hero_section.png');
  }

  // Check Navbar Screenshot
  const navbar = await page.$('#main-header');
  if (navbar) {
    await navbar.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_navbar.png') });
    console.log('Saved: desktop_navbar.png');

    const firstDockItem = await navbar.$('.nav-dock-item:nth-child(2)');
    if (firstDockItem) {
      await firstDockItem.hover();
      await page.waitForTimeout(300);
      await navbar.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_navbar_hover.png') });
      console.log('Saved: desktop_navbar_hover.png');
    }
  }

  // Test Language Switch to English
  console.log('Testing Language Switch to English...');
  const langBtnEn = await page.$('#lang-btn-en');
  if (langBtnEn) {
    await langBtnEn.click();
    await page.waitForTimeout(500);
    if (navbar) {
      await navbar.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_navbar_en.png') });
      console.log('Saved: desktop_navbar_en.png');
    }
    if (heroSection) {
      await heroSection.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_hero_section_en.png') });
      console.log('Saved: desktop_hero_section_en.png');
    }
    // Switch back to Vietnamese
    await page.click('#lang-btn-vi');
    await page.waitForTimeout(300);
  }

  // Check Pillars (4 Cards) Section
  const pillarsSection = await page.$('#pillars');
  if (pillarsSection) {
    await pillarsSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await pillarsSection.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_pillars.png') });
    console.log('Saved: desktop_pillars.png');

    const firstCard = await pillarsSection.$('.grid > div:first-child');
    if (firstCard) {
      await firstCard.hover();
      await page.waitForTimeout(300);
      await firstCard.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_card1_hover.png') });
      console.log('Saved: desktop_card1_hover.png');
    }
  }

  // Check Pain Points Section
  const painPointsSection = await page.$('#pain-points');
  if (painPointsSection) {
    await painPointsSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await painPointsSection.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_pain_points.png') });
    console.log('Saved: desktop_pain_points.png');
  }

  // Check ROI Calculator Section
  const roiSection = await page.$('#roi-calculator');
  if (roiSection) {
    await roiSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await roiSection.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_roi_calculator.png') });
    console.log('Saved: desktop_roi_calculator.png');

    // Test clicking a tier button
    const largeTierBtn = await page.$('#roi-btn-large');
    if (largeTierBtn) {
      await largeTierBtn.click();
      await page.waitForTimeout(400);
      await roiSection.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_roi_calculator_large.png') });
      console.log('Saved: desktop_roi_calculator_large.png');
    }
  }

  // Check FAQ Section
  const faqSection = await page.$('#faq');
  if (faqSection) {
    await faqSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await faqSection.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_faq.png') });
    console.log('Saved: desktop_faq.png');

    // Test expanding an FAQ item
    const firstFaqBtn = await page.$('#faq button');
    if (firstFaqBtn) {
      await firstFaqBtn.click();
      await page.waitForTimeout(400);
      await faqSection.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_faq_opened.png') });
      console.log('Saved: desktop_faq_opened.png');
    }
  }

  // Check Ecosystem Product Showcase
  const ecosystemSection = await page.$('#ecosystem');
  if (ecosystemSection) {
    await ecosystemSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await ecosystemSection.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_ecosystem.png') });
    console.log('Saved: desktop_ecosystem.png');
  }

  // Check Contact Consult Survey Form
  const consultSection = await page.$('#contact-consult');
  if (consultSection) {
    await consultSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await consultSection.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_consult_form.png') });
    console.log('Saved: desktop_consult_form.png');
  }

  // Test form filling and submission
  console.log('Testing survey form submission...');
  await page.fill('#consult-salon-name', 'Glamour Nails Lounge');
  await page.fill('#consult-owner-name', 'Andy Tran');
  await page.fill('#consult-location', 'Houston, TX 77036');
  await page.fill('#consult-contact', '+1 (714) 888-9999');
  await page.selectOption('#consult-scale', '5 - 10 bàn thợ');
  await page.selectOption('#consult-status', 'Đang ế khách đầu tuần (Mon-Wed)');
  await page.click('#consult-submit-btn');
  await page.waitForTimeout(1000);
  await consultSection.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_consult_submitted.png') });
  console.log('Saved: desktop_consult_submitted.png');

  // Check Footer Section
  const footerSection = await page.$('#footer');
  if (footerSection) {
    await footerSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await footerSection.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_footer.png') });
    console.log('Saved: desktop_footer.png');
  }

  // Check Floating Speed Dial Click
  const speedDialBtn = await page.$('#speeddial-trigger-btn');
  if (speedDialBtn) {
    await speedDialBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'desktop_speeddial_opened.png') });
    console.log('Saved: desktop_speeddial_opened.png');
    // close it back
    await speedDialBtn.click();
    await page.waitForTimeout(300);
  }

  // Check 1280px and 1024px navbar to ensure zero button clipping
  console.log('Testing 1280px laptop viewport...');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'laptop_1280_navbar.png') });
  console.log('Saved: laptop_1280_navbar.png');

  console.log('Testing 1024px tablet viewport...');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'tablet_1024_navbar.png') });
  console.log('Saved: tablet_1024_navbar.png');

  // Return to 1920x1080 for remaining checks
  await page.setViewportSize({ width: 1920, height: 1080 });

  // Detect overflow on desktop
  const desktopOverflows = await page.evaluate(() => {
    const issues = [];
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      if (['HTML', 'BODY', 'SVG', 'PATH', 'SCRIPT', 'STYLE'].includes(el.tagName)) continue;
      const isScrollableX = window.getComputedStyle(el).overflowX === 'auto' || window.getComputedStyle(el).overflowX === 'scroll';
      if (!isScrollableX && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 5) {
        issues.push({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          textSnippet: el.innerText ? el.innerText.substring(0, 40).replace(/\n/g, ' ') : ''
        });
      }
    }
    return issues;
  });
  console.log('Desktop Overflows detected:', desktopOverflows.length);
  if (desktopOverflows.length > 0) {
    console.log(JSON.stringify(desktopOverflows.slice(0, 5), null, 2));
  }

  // 2. MOBILE VIEWPORT 390x844
  console.log('\n[2/2] Testing Mobile 390x844 (iPhone 12/13/14)...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Full page screenshot
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'mobile_full.png'), fullPage: true });
  console.log('Saved: mobile_full.png');

  // Hero Card Screenshot mobile
  const heroCardMobile = await page.$('.hero-dashboard-card');
  if (heroCardMobile) {
    await heroCardMobile.screenshot({ path: path.join(OUTPUT_DIR, 'mobile_hero_card.png') });
    console.log('Saved: mobile_hero_card.png');
  }

  // Mobile Pillars Section Screenshot
  const mobilePillars = await page.$('#pillars');
  if (mobilePillars) {
    await mobilePillars.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'mobile_pillars.png') });
    console.log('Saved: mobile_pillars.png');
  }

  // Mobile Ecosystem Section Screenshot
  const mobileEcosystem = await page.$('#ecosystem');
  if (mobileEcosystem) {
    await mobileEcosystem.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await mobileEcosystem.screenshot({ path: path.join(OUTPUT_DIR, 'mobile_ecosystem.png') });
    console.log('Saved: mobile_ecosystem.png');
  }

  // Mobile Consult Survey Form Screenshot
  const mobileConsult = await page.$('#contact-consult');
  if (mobileConsult) {
    await mobileConsult.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await mobileConsult.screenshot({ path: path.join(OUTPUT_DIR, 'mobile_consult_form.png') });
    console.log('Saved: mobile_consult_form.png');
  }

  // Mobile overflow detection
  const mobileOverflows = await page.evaluate(() => {
    const issues = [];
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      if (['HTML', 'BODY', 'SVG', 'PATH', 'SCRIPT', 'STYLE'].includes(el.tagName)) continue;
      const isScrollableX = window.getComputedStyle(el).overflowX === 'auto' || window.getComputedStyle(el).overflowX === 'scroll';
      if (!isScrollableX && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 5) {
        issues.push({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          textSnippet: el.innerText ? el.innerText.substring(0, 40).replace(/\n/g, ' ') : ''
        });
      }
    }
    return issues;
  });
  console.log('Mobile Overflows detected:', mobileOverflows.length);
  if (mobileOverflows.length > 0) {
    console.log(JSON.stringify(mobileOverflows.slice(0, 5), null, 2));
  }

  // Check for any remaining old keywords
  const oldKeywords = ['SMM Panel', 'smm panel', 'Automatic delivery speed', 'API online', 'modern growth teams', 'proxy', 'server load'];
  const keywordMatches = await page.evaluate((keywords) => {
    const bodyText = document.body.innerText;
    return keywords.filter(kw => bodyText.toLowerCase().includes(kw.toLowerCase()));
  }, oldKeywords);
  console.log('\nChecking for leftover old keywords:', keywordMatches);

  await browser.close();
  console.log('\n--- VISUAL CHECK FINISHED ---');
}

runVisualCheck().catch(err => {
  console.error('Error running check:', err);
  process.exit(1);
});
