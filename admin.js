/* ============================================================
   PUCK'D — Admin Dashboard Logic
   Handles staff login (Supabase Auth) and publishing articles
   to the "article" table in Supabase (with optional hero image
   upload to the "article-images" storage bucket).
   ============================================================ */

// ---- DOM refs -------------------------------------------------
const loginSection   = document.getElementById('loginSection');
const dashboard      = document.getElementById('dashboard');
const editorSection  = document.getElementById('editorSection');

const emailInput     = document.getElementById('email');
const passwordInput  = document.getElementById('password');
const loginBtn       = document.getElementById('loginBtn');
const logoutBtn      = document.getElementById('logoutBtn');
const newArticleBtn  = document.getElementById('newArticleBtn');
const publishBtn     = document.getElementById('publishBtn');

const statusDot      = document.getElementById('statusDot');
const statusLabel    = document.getElementById('statusLabel');

const titleInput     = document.getElementById('title');
const summaryInput   = document.getElementById('summary');
const categorySelect = document.getElementById('category');
const authorInput    = document.getElementById('author');
const heroImageInput = document.getElementById('heroImage');
const heroPreview    = document.getElementById('heroPreview');

// ---- Quill editor ----------------------------------------------
let quill = null;
function getQuill(){
  if(!quill){
    quill = new Quill('#editor', {
      theme: 'snow',
      placeholder: 'Write the article...',
      // Whitelist formats so pasted text can't bring in color/background/font.
      formats: ['bold','italic','underline','strike','link','header',
                'list','blockquote','code-block','image']
    });
  }
  return quill;
}

// ---- Small status/message helper --------------------------------
// Injects a lightweight message banner above the publish button so
// errors/success are visible without breaking the existing markup.
let msgEl = null;
function showMessage(text, type){
  if(!msgEl){
    msgEl = document.createElement('p');
    msgEl.style.fontFamily = "'IBM Plex Mono', monospace";
    msgEl.style.fontSize = '12px';
    msgEl.style.letterSpacing = '.04em';
    msgEl.style.marginTop = '12px';
    publishBtn.insertAdjacentElement('afterend', msgEl);
  }
  msgEl.textContent = text;
  msgEl.style.color = type === 'error' ? 'var(--pink)' : 'var(--slate)';
}

// ---- Auth state --------------------------------------------------
function setSignedIn(isSignedIn){
  loginSection.style.display = isSignedIn ? 'none' : 'block';
  dashboard.style.display = isSignedIn ? 'block' : 'none';
  statusDot.classList.toggle('is-live', isSignedIn);
  statusLabel.textContent = isSignedIn ? 'Signed in' : 'Signed out';
  if(!isSignedIn){
    editorSection.style.display = 'none';
  }
}

async function checkSession(){
  const { data, error } = await db.auth.getSession();
  if(error){
    console.error(error);
  }
  setSignedIn(!!(data && data.session));
}

loginBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if(!email || !password){
    alert('Enter your email and password.');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in…';

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  loginBtn.disabled = false;
  loginBtn.textContent = 'Login';

  if(error){
    alert('Login failed: ' + error.message);
    return;
  }

  passwordInput.value = '';
  setSignedIn(!!(data && data.session));
});

logoutBtn.addEventListener('click', async () => {
  await db.auth.signOut();
  setSignedIn(false);
});

newArticleBtn.addEventListener('click', () => {
  editorSection.style.display = 'block';
  getQuill();
  editorSection.scrollIntoView({ behavior: 'smooth' });
});

// ---- Hero image preview -------------------------------------------
let heroFile = null;
heroImageInput.addEventListener('change', () => {
  const file = heroImageInput.files[0];
  heroFile = file || null;
  if(file){
    heroPreview.src = URL.createObjectURL(file);
    heroPreview.style.display = 'block';
  } else {
    heroPreview.style.display = 'none';
  }
});

// ---- Helpers -------------------------------------------------------
function slugify(title){
  const base = (title || 'article')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base || 'article'}-${Date.now().toString(36)}`;
}

// Shrink photos before upload: max 1600px wide, WebP (JPEG if the browser
// can't encode WebP). Keeps the original if it's already smaller, and leaves
// GIFs alone so animations survive.
async function shrinkImage(file){
  if(!/^image\/(png|jpe?g|webp|avif|bmp)$/i.test(file.type)) return file;
  try{
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if(bitmap.close) bitmap.close();
    const toBlob = type => new Promise(res => canvas.toBlob(res, type, 0.82));
    let blob = await toBlob('image/webp');
    if(!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg');
    return blob && blob.size < file.size ? blob : file;
  }catch(e){
    console.warn('Could not shrink image, uploading original', e);
    return file;
  }
}

function readMinutes(html){
  const words = (html || '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

async function uploadHeroImage(file, slug){
  const upload = await shrinkImage(file);
  const ext = upload === file
    ? (file.name.split('.').pop() || 'jpg').toLowerCase()
    : (upload.type === 'image/webp' ? 'webp' : 'jpg');
  const path = `${slug}.${ext}`;

  // File names are unique per upload, so browsers and CDNs may cache them for a year.
  const { error: uploadError } = await db
    .storage
    .from('article-images')
    .upload(path, upload, {
      upsert: true,
      cacheControl: '31536000',
      contentType: upload.type || file.type || undefined
    });

  if(uploadError){
    throw new Error('Image upload failed: ' + uploadError.message);
  }

  const { data } = db.storage.from('article-images').getPublicUrl(path);
  return data ? data.publicUrl : null;
}

// ---- Publish ---------------------------------------------------------
publishBtn.addEventListener('click', async () => {
  const title = titleInput.value.trim();
  const summary = summaryInput.value.trim();
  const category = categorySelect.value;
  const author = authorInput.value.trim();
  const bodyHtml = getQuill().root.innerHTML.trim();
  const bodyIsEmpty = getQuill().getText().trim().length === 0;

  if(!title || !summary || !author || bodyIsEmpty){
    showMessage('Fill in title, summary, author, and body before publishing.', 'error');
    return;
  }

  publishBtn.disabled = true;
  publishBtn.textContent = 'Publishing…';
  showMessage('Publishing…', 'info');

  try{
    const slug = slugify(title); // only used to name the uploaded image file

    let imageUrl = null;
    if(heroFile){
      imageUrl = await uploadHeroImage(heroFile, slug);
    }

    const row = {
      title,
      summary,
      category,
      author,
      context: bodyHtml,
      image_url: imageUrl,
      read_minutes: readMinutes(bodyHtml),
      created_at: new Date().toISOString()
    };
    let { error: insertError } = await db.from('article').insert([row]);

    // read_minutes column not added yet (see SUPABASE-EGRESS.md): publish without it.
    if(insertError && /read_minutes/.test(insertError.message || '')){
      delete row.read_minutes;
      ({ error: insertError } = await db.from('article').insert([row]));
    }

    if(insertError){
      throw new Error(insertError.message);
    }

    showMessage('Article published.', 'success');

    // Reset the form for the next article
    titleInput.value = '';
    summaryInput.value = '';
    authorInput.value = '';
    categorySelect.selectedIndex = 0;
    heroImageInput.value = '';
    heroFile = null;
    heroPreview.style.display = 'none';
    getQuill().setContents([]);

  }catch(err){
    console.error(err);
    showMessage(err.message || 'Something went wrong publishing this article.', 'error');
  }finally{
    publishBtn.disabled = false;
    publishBtn.textContent = 'Publish Article';
  }
});

// ---- Init --------------------------------------------------------------
checkSession();
