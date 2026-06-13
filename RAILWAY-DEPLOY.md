# Railway deploy uzilgan bo'lsa

GitHub da kod yangi, lekin Railway eski commitda qolgan = **GitHub ulanishi uzilgan**.

## Tez tuzatish (1 daqiqa)

### Variant A — Deploy Hook (tavsiya)
1. [railway.app](https://railway.app) → **FaceIdBot** → **Settings** → **Deploy Hook** → URL nusxalang
2. GitHub → `davlatbekkhasanov-spec/face-id-bot` → **Settings** → **Secrets** → **Actions**
3. **New secret:** nomi `RAILWAY_DEPLOY_HOOK`, qiymati — nusxalangan URL
4. Keyingi har push avtomatik deploy qiladi

### Variant B — Repo qayta ulash
1. Railway → **FaceIdBot** → **Settings** → **Source** → **Disconnect**
2. **Connect Repo** → `davlatbekkhasanov-spec/face-id-bot` → branch **main**
3. **Redeploy** — commit: `Fix Railway crash` yoki yangiroq ko'rinishi kerak

## Do'kon boti (asosiy)
Railway crash bo'lsa ham do'konda **ISHGA-TUSHIR.bat** ishlaydi.
Terminal IP: **192.168.110.135**
