# WhatsLonexelyn

Aplikasi chat bergaya WhatsApp tanpa build: HTML, JS, dan CSS biasa dengan backend Supabase. Tidak perlu npm.

## Pasang

1. Supabase > SQL Editor: jalankan isi `schema.sql` (cukup sekali).
2. Supabase > Authentication > Providers > Email: matikan "Confirm email".
3. Upload semua file ke root repo GitHub, lalu Settings > Pages > Deploy from a branch > `main` / root.

URL dan publishable key Supabase ada di bagian atas `app.js`. Key publishable aman dipublikasikan karena data dilindungi RLS di `schema.sql`; jangan pernah memasukkan secret key.
