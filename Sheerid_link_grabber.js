const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const readline = require('readline');
const axios = require('axios');
const FormData = require('form-data');

const IS_HEADLESS = process.env.HEADLESS === '1' || process.argv.includes('--headless');

const TELEGRAM_TOKEN = '8796052869:AAEHphof8l_AvKLT_u-ozT1p1EbDGnuHTuQ';
const TELEGRAM_CHAT_ID = '7676651391';

const LINK_FILE = path.join(__dirname, 'link.txt');

const saveSheerIDUrl = async (email, url) => {
  try {

    let existingEntries = [];
    if (fs.existsSync(LINK_FILE)) {
      existingEntries = fs.readFileSync(LINK_FILE, 'utf-8')
        .split('\n')
        .filter(line => line.trim());
    }
    
    
    const newEntry = `${email}:${url}`;
    
    
    const isEmailExists = existingEntries.some(entry => entry.startsWith(`${email}:`));
    
    if (!isEmailExists) {
      existingEntries.push(newEntry);
      fs.writeFileSync(LINK_FILE, existingEntries.join('\n'));
      console.log(`✅ URL SheerID disimpan untuk ${email}`);
      
      
      await kirimTelegram(`🔗 *URL SheerID Baru:*\n\`${email}\`\n\`${url}\``);
    } else {
      console.log(`ℹ️ URL untuk ${email} sudah ada, dilewati`);
    }
  } catch (err) {
    console.error('❌ Gagal menyimpan URL:', err.message);
  }
};


const kirimTelegram = async (pesan) => {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: pesan,
      parse_mode: 'Markdown'
    });
  } catch (err) {
    console.error('❌ Gagal kirim Telegram:', err.message);
  }
};


const kirimFileTelegram = async (filePath) => {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`;
  
  try {
    
    const fileStats = fs.statSync(filePath);
    if (fileStats.size === 0) {
      console.log('⚠️ File kosong, tidak dikirim ke Telegram');
      await kirimTelegram('📭 *File link.txt kosong*\nTidak ada URL SheerID yang berhasil dikumpulkan.');
      return;
    }

    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('document', fileStream, {
      filename: path.basename(filePath),
      contentType: 'text/plain'
    });
    formData.append('caption', '📁 *File link.txt*\nBerisi kumpulan URL SheerID dalam format email:link\n\nFormat: email:url');

    const response = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });
    
    if (response.data.ok) {
      console.log('✅ File berhasil dikirim ke Telegram');
    } else {
      console.log('⚠️ Gagal mengirim file ke Telegram:', response.data.description);
    }
  } catch (err) {
    console.error('❌ Error mengirim file ke Telegram:', err.message);
    
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      if (fileContent.trim()) {
        await kirimTelegram(`📄 *Isi ${path.basename(filePath)}:*\n\`\`\`\n${fileContent}\n\`\`\``);
      }
    } catch (fallbackErr) {
      console.error('❌ Gagal mengirim fallback juga:', fallbackErr.message);
    }
  }
};

puppeteer.use(StealthPlugin());

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));


const askThreadCount = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question('🧵 Mau pakai berapa thread (1-20)? ', answer => {
      rl.close();
      const num = parseInt(answer);
      if (isNaN(num) || num < 1 || num > 20) {
        console.log('❌ Input tidak valid. Masukkan angka 1 - 20.');
        process.exit(1);
      }
      resolve(num);
    });
  });
};


const displayResults = async () => {
  if (fs.existsSync(LINK_FILE)) {
    const content = fs.readFileSync(LINK_FILE, 'utf-8');
    const entries = content.split('\n').filter(line => line.trim());
    const totalLinks = entries.length;
    
    console.log(`\n📋 Total ${totalLinks} URL SheerID terkumpul di link.txt (format email:link):`);
    console.log("=".repeat(80));
    
    entries.forEach((entry, index) => {
      const [email, url] = entry.split(':');
      console.log(`${index + 1}. ${email}`);
      console.log(`   ${url}`);
      console.log("-".repeat(80));
    });
    
    
    await kirimFileTelegram(LINK_FILE);
    
    return entries.length;
  }
  return 0;
};


const processSingleAccount = async ({ email, pass }, browserIndex, failedAccounts) => {
  console.log(`🚀 [Browser ${browserIndex}] Memproses akun: ${email}`);

  const userDataDir = path.join(__dirname, 'TEMP', `profile-${browserIndex}`);
  const browser = await puppeteer.launch({
    headless: IS_HEADLESS ? 'new' : false,
    userDataDir,
    defaultViewport: { width: 1366, height: 768 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--lang=US',
      '--disable-features=site-per-process',
      '--disable-features=NetworkService',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-popup-blocking',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--metrics-recording-only',
      '--blink-settings=imagesEnabled=false',
      '--safebrowsing-disable-auto-update',
      '--window-size=1366,768'
    ]
  });

  const page = await browser.newPage();
  let sheerIDUrl = null;

  try {
    await page.goto('https://accounts.google.com/servicelogin?hl=id', { waitUntil: 'networkidle2' });
    const emailSelector = 'input[type="email"], input#identifierId';
    await page.waitForSelector(emailSelector, { visible: true, timeout: 30000 });
    await delay(1500); 

    await page.evaluate((sel) => {
      const input = document.querySelector(sel);
      if (input) {
        input.focus();
        input.click();
      }
    }, emailSelector);
    
    await page.click(emailSelector);
    await delay(500);

    await page.click(emailSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(emailSelector, email, { delay: 100 });
    
    const currentInputValue = await page.evaluate((sel) => document.querySelector(sel).value, emailSelector);
    if (!currentInputValue || currentInputValue !== email) {
      await page.evaluate((sel, val) => {
        const input = document.querySelector(sel);
        input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, emailSelector, email);
    }

    await delay(1000);

    let clickedNext = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (let btn of buttons) {
        if (btn.innerText.includes('Berikutnya') || btn.innerText.includes('Next') || btn.id === 'identifierNext') {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (!clickedNext) {
      try {
        await page.click('#identifierNext');
      } catch (e) {
        await page.keyboard.press('Enter');
      }
    }

    await page.waitForSelector('input[type="password"]', { visible: true, timeout: 10000 });
    await page.click('input[type="password"]');
    await delay(300);
    await page.type('input[type="password"]', pass, { delay: 100 });
    await page.keyboard.press('Enter');

	
	try {
	  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
	} catch (navErr) {
	  console.log(`⚠️ [${email}] Navigasi lambat, lanjut cek URL...`);
	}

	
	const currentUrl = page.url();
	console.log(`📍 [${email}] URL setelah login: ${currentUrl}`);

	if (currentUrl.includes('/speedbump/gaplustos')) {
	  console.log(`⚠️ [${email}] Terdeteksi Gaplutos, mencoba konfirmasi...`);
	  
	  
	  let confirmButton = await page.$('input#confirm');
	  if (!confirmButton) {
		
		confirmButton = await page.$('button[aria-label*="Confirm"], button:has-text("Confirm"), button:has-text("Saya mengerti")');
	  }
	  if (!confirmButton) {
		
		await page.keyboard.press('Enter');
		await delay(3000);
		confirmButton = await page.$('input#confirm');
	  }
	  
	  if (confirmButton) {
		await confirmButton.click();
		
		await delay(5000); 
	  } else {
		
	  }
	}

	
	try {
	  await page.waitForFunction(
		() => window.location.href.includes('myaccount.google.com') || 
			   window.location.href.includes('google.com'),
		{ timeout: 15000 }
	  );
	} catch (err) {
	  console.log(`❌ [${email}] Gagal masuk ke akun setelah Gaplutos`);
	  failedAccounts.push({ email, pass });
	  await browser.close();
	  return;
	}

	console.log(`✅ Login berhasil: ${email}`);

    await page.goto('https://youtube.com/youtube_premium/student');
    await page.waitForSelector('body', { timeout: 15000 });

    if (page.url().includes("/oops")) {
      console.log(`⚠️ [${email}] Redirect ke /oops - tidak dapat mengakses halaman student`);
    }

    const tryButtonSelector = `
      button[aria-label*="Coba 1 bulan"],
      button[aria-label*="Coba 1 bulan seharga Rp 0"],
      button[aria-label*="Dapatkan Paket Pelajar"],
      button[aria-label*="Try 1 month"],
      button[aria-label*="Get Student Plan"],
      button[aria-label*="Lanjutkan dengan Mendaftar"],
      button[aria-label*="Continue With Signup"]
    `;

    await page.waitForSelector(tryButtonSelector, { timeout: 15000 });
    await page.click(tryButtonSelector);
    await delay(3000);

    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      await delay(1000);
    }
    await page.keyboard.press('Enter');

    
    try {
      await page.waitForFunction(
        () => window.location.href.includes('https://offers.sheerid.com/'),
        { timeout: 20000 }
      );
    } catch (err) {
      console.log(`⚠️ Tidak redirect ke SheerID langsung, mencoba cara alternatif...`);
      
      
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        await delay(500);
      }
      await page.keyboard.press('Enter');
      await delay(3000);
    }

    
    sheerIDUrl = await page.url();
    console.log(`🔗 [Browser ${browserIndex}] URL ditemukan: ${sheerIDUrl}`);
    
    
    if (sheerIDUrl.includes('sheerid.com')) {
      await saveSheerIDUrl(email, sheerIDUrl);
      
      
      const akunFilePath = path.join(__dirname, 'akun.txt');
      let currentList = fs.readFileSync(akunFilePath, 'utf-8')
        .split('\n')
        .filter(Boolean);
      currentList = currentList.filter(line => !line.includes(email));
      fs.writeFileSync(akunFilePath, currentList.join('\n'));
      
      console.log(`✅ URL SheerID berhasil diambil untuk akun: ${email}`);
      await kirimTelegram(`✅ *SUKSES* ambil URL SheerID:\nAkun: \`${email}\`\nURL: \`${sheerIDUrl}\``);
    } else {
      console.log(`❌ URL tidak mengandung sheerid.com: ${sheerIDUrl}`);
      failedAccounts.push({ email, pass });
    }

    
    await delay(2000);

  } catch (err) {
    console.log(`🚫 Error akun ${email}: ${err.message}`);
    await kirimTelegram(`❌ *ERROR* akun:\n\`${email}\`\nPesan: \`${err.message}\``);
    failedAccounts.push({ email, pass });
  } finally {
    try {
      if (browser && browser.close) {
        await browser.close();
      }
    } catch (e) {
      console.log('⚠️ Browser sudah tertutup lebih dulu:', e.message);
    }

    
    try {
      const userDataDir = path.join(__dirname, 'TEMP', `profile-${browserIndex}`);
      if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      }
    } catch (_) {}
  }
};


const processAccountsInBatches = async (akunList, threadCount) => {
  const failedAccounts = [];
  let batchIndex = 0;

  while (akunList.length > 0) {
    console.log(`\n🚀 Memulai batch ${batchIndex + 1}`);

    const currentBatch = akunList.splice(0, threadCount);

    const browserPromises = currentBatch.map((akun, index) => {
      return new Promise(resolve => {
        setTimeout(async () => {
          const browserNum = index + 1;
          await processSingleAccount(akun, browserNum, failedAccounts);
          resolve();
        }, index * 2000); 
      });
    });

    await Promise.all(browserPromises);
    batchIndex++;
  }

  
  if (failedAccounts.length > 0) {
    const failed = failedAccounts.map(acc => `${acc.email} ${acc.pass}`).join('\n');
    fs.writeFileSync('akun_gagal.txt', failed);
    console.log(`\n⚠️ ${failedAccounts.length} akun gagal, disimpan ke akun_gagal.txt`);
    
    
    if (fs.existsSync('akun_gagal.txt')) {
      await kirimFileTelegram('akun_gagal.txt');
    }
  }

  console.log('\n🎉 Proses pengambilan URL SheerID selesai!');
  
  
  const totalLinks = await displayResults();
  
  
  await kirimTelegram(`📊 *RINGKASAN SELESAI*\nTotal URL SheerID terkumpul: ${totalLinks}\nFormat: email:link\nFile link.txt telah dikirim sebagai dokumen.`);
  
  
  const tempDir = path.join(__dirname, 'TEMP');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('🧹 Folder TEMP dibersihkan');
  }
};

process.on('unhandledRejection', (reason, p) => {
  console.error('🔴 [unhandledRejection] Bot lanjut jalan. Detail:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🔴 [uncaughtException] Bot lanjut jalan. Detail:', err);
});


(async () => {
  
  if (!fs.existsSync(LINK_FILE)) {
    fs.writeFileSync(LINK_FILE, '');
    console.log('📁 File link.txt dibuat');
  }
  
  
  const tempDir = path.join(__dirname, 'TEMP');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  
  const akunList = fs.readFileSync('akun.txt', 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [email, pass] = line.trim().split(' ');
      return { email, pass };
    });

  if (akunList.length === 0) {
    console.log('❌ Tidak ada akun di akun.txt');
    await kirimTelegram('❌ *ERROR:* Tidak ada akun di akun.txt');
    process.exit(1);
  }

  console.log(`📋 Total ${akunList.length} akun akan diproses`);
  await kirimTelegram(`🚀 *Memulai proses*\nTotal akun: ${akunList.length}\nMode: ${IS_HEADLESS ? 'Headless' : 'Browser Terlihat'}`);
  
  const threadCount = await askThreadCount();
  await processAccountsInBatches(akunList, threadCount);
  
  console.log('\n✨ Semua proses telah selesai!');
})();