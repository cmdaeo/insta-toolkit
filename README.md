# insta-toolkit

## ENG

1. Get the Instagram data export `.zip`: when selecting what to export, you can clear everything except **Connections** (that's where `followers_and_following/` lives).
2. Open `index.html` and drop the `.zip` → click **Analyze**. You'll see four counters and two lists: *They don't follow you* and *Pending you sent*.
3. Install [Tampermonkey](https://www.tampermonkey.net/) on Chrome (or any Chromium-based browser).
4. Install the userscript from this repo (`instagram-pending-canceller.user.js`). Open Tampermonkey → *Create a new script* → paste the file contents → save.
   - ⚠️ Make sure you're logged in to **the Instagram account the export belongs to** in the same browser profile — the script uses your session cookies.
   - ⚠️ Keep `index.html` open in one tab (the panel appears in the bottom-right corner: **Instagram Pending Canceller**).
5. In the analyzer tab:
   - Click **Load pending from analyzer** → loads the queue from the `Pending you sent` list and sets `Active: yes`.
   - Click **Open Instagram worker** → opens the first pending profile in a new tab.
6. Leave the Instagram tab open. The worker navigates profile-by-profile, clicks **Requested → Unfollow**, and marks each one as *canceled* / *denied* (already-following) / *failed* in the audit state.
   - You can watch progress in the Instagram-tab panel (`Queue: n/total`) or refresh the analyzer tab.
   - **Pause** freezes the runner; **Skip current** advances the index; **Stop & clear** wipes the saved state.
7. When the queue reaches `n/total`, the worker stops. Denied usernames (those you already followed) are listed in the textarea for reference.

---

## PT

1. Obtém o ficheiro `.zip` de exportação de dados do Instagram: ao escolher o que exportar, podes limpar tudo exceto **Connections** (é onde está a pasta `followers_and_following/`).
2. Abre o `index.html` e arrasta o `.zip` para a drop-zone → clica em **Analyze**. Vais ver quatro contadores e duas listas: *They don't follow you* e *Pending you sent*.
3. Instala o [Tampermonkey](https://www.tampermonkey.net/) no Chrome (ou outro navegador baseado em Chromium).
4. Instala o userscript do repositório (`instagram-pending-canceller.user.js`). Abre o Tampermonkey → *Create a new script* → cola o conteúdo do ficheiro → guarda.
   - ⚠️ Garante que estás com sessão iniciada **na conta do Instagram a que o export pertence**, no mesmo perfil de browser — o script usa os cookies de sessão.
   - ⚠️ Mantém o `index.html` aberto num separador (aparece um painel no canto inferior direito: **Instagram Pending Canceller**).
5. No separador do analyzer:
   - Clica em **Load pending from analyzer** → carrega a fila a partir da lista *Pending you sent* e fica com `Active: yes`.
   - Clica em **Open Instagram worker** → abre o primeiro perfil pendente num novo separador.
6. Deixa o separador do Instagram aberto. O worker navega perfil a perfil, clica em **Requested → Unfollow** e marca cada um como *canceled* / *denied* (já segues) / *failed* no estado do audit.
   - Podes acompanhar o progresso no painel do separador do Instagram (`Queue: n/total`) ou atualizar o separador do analyzer.
   - **Pause** congela o runner; **Skip current** avança o índice; **Stop & clear** apaga o estado guardado.
7. Quando a fila chega a `n/total`, o worker para. Os usernames *denied* (aqueles que já seguías) ficam listados na textarea para referência.
