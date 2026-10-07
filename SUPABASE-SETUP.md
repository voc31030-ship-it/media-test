# Supabase setup for project media

GitHub Pages serves the site but cannot receive or store uploads itself. Supabase provides the shared file storage, metadata, and sign-in used by `upload.html` and `project.html`.

## 1. Create the bucket

In your Supabase project, open **Storage** and create a bucket named `voc31030-ship-it's Org`. Set it to **Public**, set its file size limit to **50 MB**, and allow the MIME types `image/*` and `video/*`. Public access lets project visitors view media; the policies below still restrict uploads and deletes to approved accounts. If the dashboard rejects that bucket ID, choose a lowercase name without spaces or punctuation and use the same ID in `js/supabase-config.js` and the SQL policies below.

## 2. Create the tables and access policies

Open the Supabase **SQL Editor** and run:

```sql
create table if not exists public.project_media_managers (
    user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.project_media_managers enable row level security;
grant select on public.project_media_managers to authenticated;

drop policy if exists "Managers can read their own approval" on public.project_media_managers;
create policy "Managers can read their own approval"
on public.project_media_managers
for select
to authenticated
using (user_id = (select auth.uid()));

create table if not exists public.project_media (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    path text not null unique,
    mime_type text not null,
    uploaded_by uuid not null references auth.users (id),
    created_at timestamptz not null default now()
);

alter table public.project_media enable row level security;
grant select on public.project_media to anon, authenticated;
grant insert, delete on public.project_media to authenticated;

drop policy if exists "Anyone can view project media" on public.project_media;
create policy "Anyone can view project media"
on public.project_media
for select
to anon, authenticated
using (true);

create or replace function public.is_project_media_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.project_media_managers
        where user_id = (select auth.uid())
    );
$$;

revoke all on function public.is_project_media_manager() from public;
grant execute on function public.is_project_media_manager() to authenticated;

drop policy if exists "Approved managers can add project media" on public.project_media;
create policy "Approved managers can add project media"
on public.project_media
for insert
to authenticated
with check (
    uploaded_by = (select auth.uid())
    and (select public.is_project_media_manager())
);

drop policy if exists "Approved managers can delete project media" on public.project_media;
create policy "Approved managers can delete project media"
on public.project_media
for delete
to authenticated
using ((select public.is_project_media_manager()));

drop policy if exists "Approved managers can upload project media" on storage.objects;
create policy "Approved managers can upload project media"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'voc31030-ship-it''s Org'
    and (select public.is_project_media_manager())
);

drop policy if exists "Approved managers can delete stored project media" on storage.objects;
create policy "Approved managers can delete stored project media"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'voc31030-ship-it''s Org'
    and (select public.is_project_media_manager())
);
```

## 3. Create and approve your manager account

On the deployed site, open **Manage Project Media**, enter your email and a password, and select **Create an account**. Confirm your email if Supabase requests it. Then run this in the SQL Editor, replacing the email:

```sql
insert into public.project_media_managers (user_id)
select id
from auth.users
where email = 'you@example.com'
on conflict do nothing;
```

Only accounts in `project_media_managers` can upload or delete. New sign-ups do not receive those permissions automatically. To approve another manager, create an account for them and run the same insert with their email. To revoke access, delete their row from `project_media_managers`.

## 4. Configure the site

In **Project Settings → API Keys**, copy your project URL and the public **publishable** key (a legacy anon key can also be used). Never use the `service_role` secret in browser code. Set those values in `js/supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
    url: "https://YOUR_PROJECT_ID.supabase.co",
    publishableKey: "YOUR_SUPABASE_PUBLISHABLE_KEY",
    bucket: "voc31030-ship-it's Org",
    maxSizeBytes: 52428800
};
```

Deploy the site to GitHub Pages over HTTPS. In **Authentication → URL Configuration**, set the site URL to your published site address and add its address to the allowed redirect URLs. The same Supabase project and bucket must remain available for uploads and gallery viewing.

The publishable key is intended to be used by browser clients; row-level security and the manager allowlist protect writes. Never put a Supabase `service_role` key in this site or commit one to the repository.

Media previously uploaded to this browser-only version is not copied automatically. Re-upload those files after connecting Supabase.
