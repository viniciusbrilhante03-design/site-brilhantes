# PRD — Brilhantes Imóveis · Gestão de Vendas e Comissões

## Problema original (pt-BR)
Planilhar vendas do mês/ano de uma imobiliária ("Brilhantes Imóveis") com data, valor de
venda, % e valor de comissão, valor de entrada, fluxos a receber (parcelas), corretor que
fez a venda. Acompanhar ranking de vendas, controlar quantas vendas no mês/ano, o que já
entrou e o que falta entrar. Controle datado.

## Decisões do usuário
- Autenticação: **Login com conta Google** (Emergent-managed Google Auth).
- Usuários: **somente o gestor** lança tudo.
- Parcelas: gestor define nº e valores; marca cada uma como "recebida".
- Ranking: por **quantidade** e por **valor total** (alternável).
- Design: padrão (verde esmeralda + dourado, "Luxury Finance"), em pt-BR.

## Arquitetura
- Frontend: React 19 + Tailwind + shadcn/ui + react-query + recharts. Fonte Plus Jakarta Sans/DM Sans/JetBrains Mono.
- Backend: FastAPI (prefixo /api) + MongoDB (motor).
- Auth: sessão via cookie httpOnly (session_token, 7 dias) + fallback Bearer.

## Persona
- Vinícius (gestor da Brilhantes Imóveis) — lança e acompanha todas as vendas e comissões.

## Requisitos centrais (estáticos)
- CRUD de vendas datadas com comissão (% e R$), entrada, parcelamento.
- Baixa de parcelas (recebido/pendente) com data.
- KPIs: total vendido, comissão total, entradas, já entrou, falta entrar, qtd de vendas.
- Filtros por mês e ano; gráfico mensal; ranking de corretores alternável.

## Implementado (2026-10-11)
- Login Google + rota protegida /dashboard; /api/auth/{session,me,logout}.
- Vendas: GET/POST/PUT/DELETE /api/sales (filtros month/year); PATCH parcelas.
- /api/stats, /api/ranking, /api/monthly-series.
- Dashboard completo: KPIs, gráfico de volume mensal, ranking (pódio) alternável,
  tabela de vendas com busca/edição/exclusão, diálogo de cadastro com geração de
  parcelas, diálogo de fluxo a receber com baixa. Tema claro/escuro.
- Seed de 13 vendas demo de 2026 para o gestor.

### Iteração 2 (2026-10-11)
- Troca "Imóvel" → **Loteamento**; campos **Quadra** e **Lote** (opcionais).
- Cliente: nome, número e e-mail (opcionais).
- **Divisão de comissão** configurável (ex.: 60% corretor / 40% imobiliária) com cálculo
  automático; KPIs Comissão Total / Corretor / Imobiliária (8 cards).
- **Importação** de planilha Excel/CSV/PDF (/api/sales/import) com reconhecimento de
  colunas em pt-BR, formatos R$ e datas DD/MM/AAAA, e modelo CSV para download.
- **Cadastro de Corretores** (/api/brokers CRUD): nome de guerra/completo, número, CRECI,
  e-mail e **foto** (opcionais); foto aparece no ranking; ranking enriquecido com
  comissão do corretor; troféu/medalhas no pódio.
- Testes: 23/23 backend + fluxos frontend 100%.

### Iteração 3 (2026-10-11)
- **Bug corrigido:** navegador traduzia o conteúdo (ex.: "GOLDEN VILLE" → "VILA DOURADA").
  Causa: index.html com `lang="en"`. Corrigido para `lang="pt-BR" translate="no"` +
  `<meta name="google" content="notranslate">` + `body.notranslate`. Dados salvos verbatim.
- **Exportar relatório** do período em **Excel (.xlsx)** e **PDF** (/api/export/xlsx, /api/export/pdf)
  com totais e divisão de comissão. Logo no topo do PDF.
- **Anexos por venda** (contratos/comprovantes): upload/listar/baixar/excluir
  (/api/sales/{id}/attachments, /api/attachments/{id}/download). Base64 em coleção própria, máx. 10 MB.
- **Logomarca** aplicada (login, cabeçalho claro/escuro, favicon, PDF). Título da aba = Brilhante's Imóveis.
- Testes: 30/30 backend; UI smoke test de export e anexos OK.

### Iteração 4 (2026-10-11) — Multiusuário / RBAC
- **Master** via Google (viniciusbrilhante03@ e brilhantesimoveis@). **Corretores** via e-mail+senha (JWT),
  senha inicial = CPF, com trocar senha + esqueci/redefinir. Link público /cadastro (self-signup ativo na hora).
- **Isolamento (ownership):** corretor vê só as próprias vendas; vê VGV geral da imobiliária; ranking é geral.
- Master cria venda digitando o nome de guerra do corretor → venda vinculada (owner) a quem vendeu.
- **Loteamentos**: só o master cadastra; autocomplete para todos; corretor só usa os já cadastrados.
- Exclusão de venda vai para **histórico** (sales_history, visível ao master em Equipe › Histórico).
- Equipe (master): lista de corretores + ativar/inativar + link de cadastro + abas Loteamentos/Histórico.
- Testes: 52/52 backend + fluxos frontend 100%.

### Iteração 5 (2026-10-12) — Financeiro por COMISSÃO (item 1/19)
- **Correção crítica:** removido o "Falta Entrar" baseado no saldo do lote. O controle agora é
  da COMISSÃO da imobiliária/corretor. Venda à vista: `commission_received`; comissão parcelada:
  parcelas geradas a partir do `commission_value` (não do valor do lote), com baixa e vencidas.
- /api/stats novo: comissao_recebida, comissao_a_receber, comissao_vencida (due_date < hoje BRT), ticket_medio.
- Dashboard (master e corretor) com cards de comissão (VGV, Gerada, Recebida, A Receber, Vencida, Ticket Médio).
- InstallmentsDialog vira "Comissão a receber" (Recebida/A receber/Vencida). Parcelas demo legadas (lote) zeradas.
- Testes: 5/5 backend + fluxos frontend 100%.

## Próximos (ordem de prioridade do cliente)
1. ✅ (iter 6) Múltiplos corretores/parceria por venda (split %, soma 100%) refletindo comissão/ranking/VGV.
2. Cadastro+histórico de clientes (autocomplete, compras por cliente).
3. Metas (coletiva e individual) + módulo Comissões dedicado com projeção.
4. Notificações (nova venda, ranking, incentivo de meta).
5. Ranking por período (semana/mês/ano/custom) e por comissão; grupos/duplas.
6. Filtros de vendas; status da venda (reserva/efetivada/cancelada/distrato); duplicidade; auditoria.
7. Importação inteligente (IA) de relatórios das construtoras com prévia.

### Iteração 6 (2026-06 fork) — Parceria / múltiplos corretores (item 1/19) ✅
- Venda agora aceita **vários corretores** via `brokers:[{name, split_pct}]` (model SaleBroker + SaleCreate.brokers).
- **Split de comissão do corretor** entre parceiros; soma validada = 100% no backend (_normalize_brokers) e na UI.
- `broker_name` combinado ("A + B"); `broker_ids` para escopo; `owner_id` = 1º parceiro.
- **Escopo do corretor** ($or owner_id/broker_ids): cada parceiro vê a venda e seu share proporcional em /api/stats.
- **Ranking** e **lista de equipe** distribuem volume/comissão por share; qtd +1 por participação.
- SaleFormDialog: linhas de corretor + % + valor ao vivo + "Adicionar parceiro" (corretor segue travado a si mesmo).
- Testes: 7/7 backend (test_multi_broker.py) + fluxo frontend 100% (iteration_5.json).

### Iteração 7 (2026-06 fork) — Clientes: autocomplete + histórico (item 2/19) ✅
- GET /api/clients (escopado): agrega vendas por nome de cliente → telefone, e-mail, qtd compras, VGV, última data e lista de compras (lote/quadra/data/valor/corretor).
- SaleFormDialog: autocomplete do nome do cliente (datalist) + **preenche telefone/e-mail** ao reconhecer cliente existente.
- Novo botão "Clientes" no cabeçalho do gestor → ClientsDialog com busca e histórico expansível por cliente.
- Corretor também tem autocomplete (vê só os próprios clientes).

### Iteração 8 (2026-06 fork) — Metas (item 3 parcial/19) ✅
- Modelo Goal: scope company|broker, metric vgv|count, target, month (None=ano), year.
- CRUD /api/goals (master); GET escopado (corretor vê coletivas + próprias) com progresso calculado
  por período próprio da meta; broker usa share (_partner_share) para parceria.
- GoalsCard (barras de progresso) no painel do gestor (com "Gerenciar") e no painel do corretor (somente leitura).
- GoalsDialog: criar/remover metas coletivas e individuais, VGV ou quantidade, mês ou ano.
- Testes: 11/11 backend (test_clients_goals.py) + fluxos frontend 100% (iteration_6.json). Correção: botão Gerenciar type="button".

### Iteração 9 (2026-06 fork) — Ranking por período, Duplas e Notificações (itens 5,8,10) ✅
- **Ranking por período**: GET /api/ranking aceita start/end (intervalo) além de month/year; RankingCard agora busca sozinho
  com seletor Semana/Mês/Ano/Personalizado e ordenação Volume/Quantidade/Comissão.
- **Duplas no ranking**: db.broker_groups + CRUD /api/broker-groups (master); ranking mescla membros em um único item
  (is_group) somando vendas/comissão sem apagar perfis. Gerenciado em Equipe › aba "Duplas" (GroupsManager, mín. 2 corretores).
- **Notificações**: db.notifications + /api/notifications (lista+unread), read-all, read/{id}. Geração ao criar venda:
  gestor recebe "nova venda"; corretor recebe sua posição no ranking e alerta de proximidade de meta (90%/100%, deduplicado
  via goal.notified_levels). Sino com badge no cabeçalho (NotificationsBell), nos painéis do gestor e do corretor.
- Testes: 11/11 backend (test_ranking_duplas_notifications.py) + fluxos frontend 100% (iteration_7.json).

### Iteração 10 (2026-06 fork) — Filtros de Vendas (item 12/16) ✅
- SalesSection agora tem painel de filtros (botão "Filtros" com contador de ativos): Loteamento, Corretor,
  Cliente, Quadra, Lote, Período (intervalo de datas) e Status (À vista / Quitado / A receber).
- Filtragem client-side sobre as vendas já carregadas; corretor em parceria é reconhecido via brokers[].name.
- Busca rápida (texto) mantida; botão "Limpar filtros".
- Correção mobile: cabeçalhos (gestor/corretor) e a barra de ações agora quebram linha (flex-wrap) em telas
  pequenas; grid com min-w-0 para evitar overflow. Tabela de vendas rola horizontalmente (overflow-x-auto) no mobile.

### Iteração 11 (2026-06 fork) — Importação Inteligente com IA (item 14/19) ✅
- Integração **Gemini 3.1 Pro** (gemini-3.1-pro-preview) via emergentintegrations + chave Emergent (EMERGENT_LLM_KEY no .env).
- POST /api/sales/import-ai/preview (master): extrai texto do arquivo (CSV decode / Excel pandas / PDF pdfplumber),
  envia ao Gemini que devolve JSON estruturado; normaliza datas/valores/comissão; marca duplicatas
  (Cliente+Loteamento+Quadra+Lote+Data+Valor+Corretor) e sinaliza novo corretor / novo loteamento. Nada é salvo aqui.
- POST /api/sales/import-ai/confirm (master): importa as linhas selecionadas, auto-cadastra loteamentos e corretores
  novos, gera parcelas. Retorna imported + new_corretores + new_loteamentos.
- UI: ImportDialog com abas "Com IA" (upload → prévia com seleção/duplicatas → confirmar) e "Planilha".
- Validado via curl (CSV bagunçado com ; e TOTAL ignorado; dedup 3/3 na re-análise) e browser (upload → prévia). Dados limpos (20 vendas).

### Iteração 12 (2026-06 fork) — Prévia editável + Importar por foto ✅
- **Importar por foto**: preview aceita imagens (.png/.jpg/.webp/.heic...); backend envia a foto ao Gemini via ImageContent
  (multimodal) e extrai as vendas igual ao PDF. Input com capture="environment" para abrir a câmera no celular.
- **Prévia editável**: na tela de prévia da IA, todos os campos são editáveis (Loteamento com datalist, Qd/Lt, Corretor
  com datalist, Cliente, Data, Valor). Badges "Novo loteamento"/"Novo corretor" recalculam ao vivo conforme a edição.
  O confirm envia as linhas já corrigidas; novos loteamentos/corretores são auto-cadastrados.
- Validado via curl (foto PNG → 2 vendas extraídas) e browser (editar corretor/loteamento → badges atualizam). Dados limpos (20 vendas).

### Iteração 13 (2026-06 fork) — "Preencher com foto (IA)" no formulário de venda ✅
- POST /api/sales/extract-one (gestor e corretor): aceita foto/PDF/planilha → Gemini extrai UMA venda → retorna
  campos normalizados (loteamento, quadra, lote, cliente/telefone/email, corretor, data, valor, comissão, parcelas).
- SaleFormDialog: banner "Preencher com foto (IA)" com upload (capture="environment" abre câmera no celular);
  preenche os campos do formulário automaticamente (não sobrescreve campo já digitado). Corretor: não altera o corretor travado.
- Validado via curl (foto de contrato → todos os campos extraídos; comissão calculada do %) e browser (upload no form → campos preenchidos).

### Iteração 14 (2026-06 fork) — Correções: metas invisíveis + upload travado na câmera ✅
- **BUG metas**: metas eram criadas mas não apareciam. Causa: GET /api/goals sem `month` retornava só metas anuais
  (month=null), escondendo metas mensais — e o dashboard usa "Ano inteiro" (sem month) e o diálogo de gestão consulta por ano.
  Fix: quando `month` é None, retorna TODAS as metas do ano (anuais + mensais). Verificado (iteration_8.json, 9/9 backend).
- **BUG upload (celular)**: inputs de foto (SaleFormDialog e ImportDialog) tinham capture="environment", forçando só a câmera
  no celular. Removido — agora o sistema oferece galeria/arquivos/PDF/câmera. Accept mantém imagens + pdf/xlsx/csv.

### Iteração 15 (2026-06 fork) — IA mais barata + Duplicar venda + dica de histórico ✅
- **Modelo IA trocado** para **gemini-2.5-flash** (bem mais barato) em _ai_extract_sales e _ai_extract_sales_from_image.
- **Duplicar venda**: botão Copy em cada linha (btn-duplicate-<id>) abre "Nova venda" pré-preenchida com cliente +
  loteamento + corretor + comissão, zerando Quadra/Lote e parcelas, para cadastrar um 2º lote do mesmo cliente como venda NOVA.
  Lógica de mutação passou a usar editing?.id (duplicar → POST, editar → PUT). Vale para gestor e corretor.
- **Dica de histórico**: ao digitar um cliente existente no formulário, mostra "Cliente já tem N compra(s) · R$ X em VGV".
- Verificado (iteration_9.json, 8/8 backend + frontend; regressão criar/editar/duplicar OK). Dados limpos (20 vendas).

### Iteração 16 (2026-06 fork) — Lote de atualizações (itens 1,2,3,5,8 parcial) ✅
- **#2 Moeda BR**: CurrencyInput (máscara em centavos) em valor da venda, comissão total, entrada e parcelas →
  digitar 4000000 vira R$ 40.000,00 (número 40000). Corrige o bug do zero à frente nas parcelas.
- **#1 Campos/obrigatórios**: Loteamento/Quadra/Lote/Nome do cliente/Valor com asterisco vermelho (*), sem a palavra
  "obrigatório". Número/E-mail/CPF/Data de nascimento com "(OPCIONAL)". Novos campos client_cpf e client_birthdate (opcionais).
- **#3 Parceria proporcional**: ranking e lista de equipe somam qtd e VGV por proporção (50/50 → 0,5 lote + metade do VGV p/ cada).
- **#5 Comemoração**: confete + frase aleatória + "🎉 Venda cadastrada!" ao criar; toggle de som (localStorage). Só no criar, não no editar.
- **#8 Ranking**: rótulo "VGV" (era "Volume"); ordem padrão por Quantidade; qtd fracionária (0,5) formatada.
- Verificado (iteration_10.json, 4/4 backend + frontend). Dados limpos (20 vendas / 0 metas / 0 duplas).
- PENDENTE p/ próximo lote: #4 transferência de venda (gestor), #6 textos de notificação (qtd/ranking/comissão a vencer),
  #7 faixas coloridas + frases nas metas, #8 esconder VGV TOTAL da imobiliária para o corretor. #10/#11 já cobertos pela importação com IA.

### Iteração 17 (2026-06 fork) — Lote 2 (itens #4, #6, #7, #8, #9) ✅
- **#4 Transferência de venda (gestor)**: POST /api/sales/{id}/transfer (master) troca o corretor da venda
  sem duplicar (brokers vira único, owner_id/owner_name/broker_ids atualizados), grava sale_audit e notifica o
  novo corretor. UI: botão btn-transfer-<id> na tabela → TransferSaleDialog (Select de corretores).
- **#8 Esconder VGV total do corretor**: stats() devolve vgv_geral/qtd_geral = None para role=corretor; card
  "VGV Geral (imobiliária)" removido do painel do corretor (restam 5 KPIs). Corretor mantém ranking/comparação.
- **#6 Notificações personalizadas**: nova venda → "X vendeu 1 lote no <loteamento>." para gestor(es) + todos os
  corretores (menos quem vendeu). Subir no ranking → "Você subiu para Nº no ranking de <mês>! 🚀" para o corretor
  e aviso aos pares/gestor. Metas 90%/100% mantidas.
- **#7 Metas com faixas**: GoalsCard com banda por % — 🟢 ≥90 "QUASE LÁ!" / ≥100 "META BATIDA! 🎉" (emerald),
  🟡 60–89 "EM EVOLUÇÃO" (amber), 🔴 0–59 "PRECISA ACELERAR" (rose); barra colorida + frase (goal-phrase-<id>).
- **#9 Aniversariantes**: GET /api/clients/birthdays?month= (escopado) + BirthdaysDialog (botão btn-open-birthdays
  em ambos os painéis) com seletor de mês e corretor responsável. Cron diário .emergent/crons.yml → POST
  /api/cron/birthdays (Bearer WEBHOOK_CRON_SECRET, ack 2xx + background _process_birthdays): avisa no dia do
  aniversário e, no dia 1, a lista do mês, para o corretor responsável + gestor.
- Testes: 10/10 backend (test_lote2.py) + fluxos UI 100% (iteration_11.json). Dados limpos (20 vendas / 0 metas).

### Iteração 18 (2026-06 fork) — Lote 3 (auditoria, duplicidade, metas, parcelas) ✅
- **Auditoria**: helper _audit grava create/update/delete/transfer em db.sale_audit; GET /api/audit (master);
  aba "Auditoria" no TeamDialog mostrando ação, venda, autor e data/hora.
- **Aviso de duplicidade**: create_sale aceita ?force=true; sem force, se já existir venda igual
  (cliente+loteamento+quadra+lote+data+corretor) retorna 409. Frontend abre DuplicateWarningDialog
  ("Salvar mesmo assim") que reenvia com force=true. Vale para gestor e corretor; não afeta edição/importação.
- **Alertas de meta multinível**: _post_sale_notifications notifica ao cruzar 50/75/90/100% (frases motivacionais),
  deduplicado via goal.notified_levels.
- **Parcela vencida/vencendo**: _process_installments + POST /api/cron/installments (cron diário) notifica
  corretor(es) responsáveis + gestor sobre parcelas de comissão vencidas e vencendo em 3 dias; marca
  notified_overdue/notified_due_soon por parcela para não repetir. NotificationsBell ganhou ícones birthday/installment.
- crons.yml: 2 crons (birthdays-daily 12:00 UTC, installments-daily 12:30 UTC).
- Testes: duplicidade 409→force, /api/audit, cron parcelas (401/200) validados via curl. Publicado em produção.

### Iteração 19 (2026-06 fork) — Importação: CPF e Data de Nascimento ✅
- COLMAP: aliases p/ CPF (CPF, CNPJ/CPF, CPF/CNPJ, Documento, CPF do cliente...) → client_cpf e p/ nascimento
  (Data de Nascimento, Nascimento, Dt. Nascimento, Data Nasc....) → client_birthdate. Novo parse_date_opt (vazio→"").
- Importação simples (build_sale_from_row) e IA (preview + confirm) agora preenchem client_cpf (só dígitos) e
  client_birthdate (YYYY-MM-DD). Prompt da IA instruído a NUNCA ignorar CPF/nascimento.
- Preview retorna mapping {cpf, birthdate}; ImportDialog mostra "Conferência do mapeamento" (CPF → CPF / Data de
  Nascimento → Data de nascimento, ou "COLUNA NÃO IDENTIFICADA") e adiciona colunas editáveis CPF e Nascimento.
  Modelo CSV atualizado com as duas colunas. Demais regras de importação inalteradas.
- Testado via curl: import simples e preview IA (cpf='12345678900', birthdate='1990-05-10'); mapping true/false corretos.

### Iteração 20 (2026-06 fork) — FIX: corretor via tudo zerado 🐞✅
- Causa: ranking agrupa por NOME, mas stats/`/sales`/`/clients` filtravam só por owner_id/broker_ids;
  vendas seed/importadas tinham owner_id=None → corretor aparecia no ranking mas via VGV/comissão/qtd/clientes zerados.
- Fix: novos helpers _user_names/_sale_belongs/_scoped_sales — escopo do corretor agora casa também pelo NOME
  (broker_name e brokers[].name, igual ao ranking). list_sales e list_clients usam _scoped_sales.
- _partner_share passou a receber `user` e considerar nome além de owner_id (VGV/comissão corretos p/ vendas sem owner_id).
- Backfill único no preview: 10 vendas tiveram owner_id/broker_ids/brokers preenchidos (nome → corretor). Em produção
  o casamento por nome funciona ao vivo (sem depender de backfill).
- Validado via API: Carlão 6 vendas/VGV 704k/comissões ok; Aninha 4 vendas. (Clientes aparecem quando a venda tem nome
  do cliente — as vendas demo estão sem client_name.) Requer REPUBLICAR para valer em produção.

### Iteração 21 (2026-06 fork) — FIX: metas não apareciam p/ corretor 🐞✅
- Sintoma: metas individuais (e coletivas) só apareciam p/ o gestor; corretor via nada.
- Causas: (1) regressão da it.20 — `_goal_progress` chamava `_partner_share(s, oid)` com string após a nova
  assinatura `(s, user)` → quebraria o cálculo; (2) visibilidade por `owner_id == uid` falha quando a mesma
  pessoa tem mais de um registro de usuário (criado manual pelo gestor vs. cadastrado no login) com ids diferentes.
- Fix: `_goal_progress` resolve o usuário dono e passa o dict p/ `_partner_share` (casa por nome, igual ao escopo).
  `list_goals` p/ corretor agora mostra TODAS as coletivas + individuais que batem por user_id OU nome/e-mail.
- Validado via API: corretor Carlão vê a meta coletiva (Imobiliária) e a individual (70,4% sobre VGV dele). Requer REPUBLICAR.

### Iteração 22 (2026-06 fork) — FASE 1 (Cliente e Venda) ✅ [checkpoint]
Backend (aditivo, dados preservados):
- Modelos `Client`/`ClientCreate`/`ClientSpouse`; coleção `clients` (name_key/cpf_key normalizados, cônjuge, origem, observação).
- `_norm_name` (sem acento/caixa/espaço). `_resolve_or_create_client` liga/cria cliente na venda (sale.client_id) e enriquece campos.
- Rotas novas: POST/PUT `/clients`, GET `/clients/search`, GET `/clients/duplicates`, POST `/clients/merge`, GET `/loteamentos/duplicates`, POST `/loteamentos/merge`. Merge reatribui vendas (não apaga histórico) + auditoria.
- Bloqueio de lote vendido no create_sale (corretor 409 `lot_sold`; gestor pode `force_lot` + `lot_reason` → auditoria `lot_override`).
- SaleCreate ganhou client_cpf/birthdate (antes não eram enviados) + client_has_spouse/spouse/origin/origin_other/notes.
Frontend:
- SaleFormDialog: cônjuge (toggle+campos), Origem (chips + "Qual?"), Observação do cliente; CPF/Nascimento agora enviados.
- DuplicatesDialog (gestor): tela de revisão para mesclar loteamentos e clientes. Botão "Duplicados" no header do gestor.
Decisões: quadra/lote seguem texto livre com bloqueio de lote já vendido (seleção por catálogo de lotes fica p/ Fase 7, que expande loteamentos — preserva comportamento atual). "Cliente sem venda" aparece na lista do gestor.
Testado (curl): dedup cliente por acento/caixa (409); venda cria cliente c/ cônjuge/origem/obs/CPF; bloqueio lote vendido; merge loteamento (GUAIÚBA→GUAIUBA) reatribuiu venda sem perda.
PENDENTE (continuação): FASES 2 a 9. Requer REPUBLICAR p/ produção.

### Iteração 23 (2026-06 fork) — FASE 2 (Valores e Comissão Avançada) ✅ [checkpoint]
Backend:
- SaleCreate: `financed_value`, `commission_base` (sale|financed), `discounts[]` (Discount: type/value/reason/notes), `commission_gross`, `commission_net`.
- `_compute_commission()`: valida (base=financed exige venda>0 e financiado>0; financiado não pode > venda), calcula base_value, bruta = base×%, líquida = bruta − descontos; grava e sincroniza commission_value=bruta. Chamado em create e update. VGV/ranking seguem usando sale_value (não muda).
Frontend (SaleFormDialog): campo Valor financiado (sempre visível, obrigatório só se base=financiado, botão "Venda − entrada"); seletor de base mostrando os dois valores; label "Base da comissão" + "Comissão bruta"; descontos/taxas linha a linha (tipo/valor/motivo) com Comissão líquida; bloqueio de salvar com msg "Preencha o valor da venda e o valor financiado." Edição carrega os campos (…empty, …initial).
Testado (curl, exemplos oficiais): 200k/150k 5% base venda→10000; base financiado→7500 (VGV=200000 nos dois); descontos 375+5+50→líquida 7070; erros 400 corretos; create+edit recalculam.
PENDENTE: loteamento com base/% padrão (opcional) ficou p/ junto da Fase 7 (expansão de loteamentos). FASES 3 a 9. REPUBLICAR p/ produção.

### Iteração 24 (2026-06 fork) — FASE 3 backend (Parcelas/Baixas/Cancelamento/Extrato) ✅ [checkpoint]
Backend:
- Installment estendida: gross, discount, net, paid, status (pendente/parcial/pago/vencida), payments[] (baixa: amount,date,method,discount,reason,notes,kind recebimento|repasse,receipt,by,at).
- `_recompute_inst` calcula net/paid/saldo/status. POST `/sales/{id}/installments/{n}/baixa` (parcial/total) + auditoria.
- PATCH `/sales/{id}/cancel` (gestor): status=cancelled + motivo + auditoria; cancelada EXCLUÍDA de VGV/ranking/metas/stats/listagem (filtros em _company_sales, _scoped_sales, _rank_from_sales, _goal_progress) mantendo histórico.
- GET `/commissions/extrato` (vendas, VGV, gerada, recebida, a receber, vencida, próximos, próximo recebimento) e GET `/commissions/agenda` (parcelas em aberto por vencimento). `_sale_comm_frac` escala comissão p/ corretor.
Testado (curl): baixa 700→parcial saldo500, +500→pago; cancel reduz VGV em 100k e some da lista; extrato OK.
PENDENTE (continuação): FRONTEND da Fase 3 — seção Comissões (ARTE 04 Extrato c/ PDF, 05 Agenda, 06 Lançamento, 07 Dar baixa) + botão Cancelar venda + nomes "Parcelas da venda" vs "Parcelas da comissão". Depois FASES 4 a 9. REPUBLICAR.

### Iteração 25 (2026-06 fork) — FASE 3 frontend (Comissões) ✅ [checkpoint]
- InstallmentsDialog reescrito: "Parcelas da comissão" com status 🟡🟠🟢🔴, líquido/pago/saldo e "Dar baixa" (valor, forma PIX/Boleto/Transferência, tipo recebimento/repasse) via POST baixa.
- CommissionsDialog (botão "Comissões" nos 2 painéis): abas Extrato (KPIs vendas/VGV/gerada/recebida/a receber/vencida + próximos recebimentos + PDF via print) e Agenda (vencimentos em aberto).
- CancelSaleDialog + botão Cancelar (gestor) no SalesSection → PATCH /cancel com motivo.
- Dashboards: baixaMut, cancelMut (gestor), commOpen; CorretorDashboard: baixaMut + Comissões.
- Frontend compila sem erros; app carrega (login OK). screenshot_tool não conclui login e2e (limitação da automação); backend 100% curl.
PENDENTE: FASES 4 a 9. (Fase 4 = comemoração + Stories 9:16; Fase 7 = IA OpenAI — exigirá chave do gestor.) REPUBLICAR p/ produção.

### Iteração 26 (2026-06 fork) — FASE 4 (Comemoração + Stories 9:16) ✅ [checkpoint]
- **CelebrationDialog** (`components/CelebrationDialog.jsx`): modal disparado 1x ao CRIAR venda (não no editar), com troféu,
  confete (`lib/celebrate.js`), foto + nome de guerra do corretor automáticos, card Loteamento/Qd·Lt + VGV da venda e
  frase motivacional aleatória ("PARABÉNS!"). Toggle de som (localStorage) mantido.
- **Compartilhar Conquista**: gera imagem **9:16 (1080×1920)** via HTML5 Canvas (logo Brilhantes, "VENDA REALIZADA! 🎉",
  foto+nome do corretor, loteamento+Qd/Lt, VGV, PARABÉNS + frase, rodapé "Brilhante's Imóveis 🦅"). **SEM dados do cliente.**
  Web Share API (arquivo) quando disponível, senão download PNG. Botão extra de download e de som.
- Wiring: Dashboard (gestor) usa `photoMap` dos corretores; CorretorDashboard usa `user.picture`. onSuccess de criar/force
  grava `celebrateSale=res.data`; removidos os antigos `celebrate()`/toast de criação (agora centralizados no modal).
- Testado (screenshot e2e, corretor Carlão): modal abre com VGV R$ 400k/550k, loteamento "Casa Praia Grande", confete OK,
  "Compartilhar" gera e baixa a imagem (toast "Imagem baixada"). Build sem erros.
- PENDENTE (continuação): FASES 5 a 9. REPUBLICAR p/ produção.

### Iteração 27 (2026-06 fork) — FASE 5 (Ranking: participação) ✅ [checkpoint]
- **Toggle de participação no ranking** (novo): campo `ranking_opt_out` no usuário corretor. PATCH
  `/corretores/{id}/ranking` {participate} (master). `ranking()` ignora corretores com opt-out (casa por nome
  war_name/name, minúsculo) — somem do pódio/lista sem perder as vendas/VGV/comissão em stats.
- TeamDialog (aba Corretores): novo Switch "No ranking" por corretor (`team-ranking-<id>`), além do "Ativo".
- Itens da Fase 5 já cobertos antes: esconder VGV total p/ corretor (it.17), faixas de meta 10–100% com frases (it.17),
  filtros por período/custom (ranking it.9, SalesSection it.10).
- Testado (curl, master): opt-out tira Carlão do ranking (6→5 entradas) e volta ao reativar.
- PENDENTE: FASES 6 a 9. (Fase 7 = IA OpenAI — exigirá chave do gestor.) REPUBLICAR p/ produção.

### Iteração 28 (2026-06 fork) — FASE 6 (Agenda + WhatsApp) e FASE 8 (Relatórios por colunas) ✅ [checkpoint]
**Fase 6 — Agenda de Compromissos:**
- Coleção `appointments` + CRUD escopado (corretor vê os seus; gestor vê todos): GET/POST/PUT `/appointments`,
  PATCH `/appointments/{id}/done`, DELETE. Campos: title, type (visita|plantao|ligacao|outro), when (YYYY-MM-DDTHH:MM),
  client_name, notes, done, owner.
- Cron `appointments-daily` (11:00 UTC) → `/api/cron/appointments` (Bearer secret, background `_process_appointments`):
  avisa corretor + gestor dos compromissos do dia (flag notified_today p/ não repetir).
- `AgendaDialog` (botão "Agenda" nos 2 painéis): lista Pendentes/Concluídos, criar/editar/concluir/excluir, datalist de clientes.
**Fase 6 — WhatsApp aniversariantes:** BirthdaysDialog ganhou botão "WhatsApp" por cliente → `https://wa.me/55<tel>?text=`
  com mensagem "Olá {nome}, eu e a Brilhante's Imóveis deseja um feliz aniversário com muitas felicidades e bençãos! 🎉🦅".
**Fase 8 — Relatórios com colunas personalizadas:**
- `/export/xlsx` e `/export/pdf` aceitam `columns` (labels separados por `||`); `_select_columns` preserva ordem padrão.
  PDF/XLSX montados dinamicamente só com as colunas escolhidas; totais recalculados por coluna monetária.
- `ExportDialog` (botão "Exportar" agora abre o diálogo): 15 colunas com checkbox + Todas/Nenhuma + botões Excel/PDF.
- Testado (curl): agenda CRUD+done, cron 401/200, xlsx só com as 3 colunas pedidas, pdf custom OK; UI (screenshot): Agenda,
  Export e WhatsApp (href com 55+tel e mensagem) validados.
- PENDENTE: FASE 7 (IA Especialista OpenAI + campos técnicos/drag-and-drop do loteamento) e FASE 9. REPUBLICAR p/ produção.

### Iteração 29 (2026-06 fork) — FASE 7 (Campos técnicos + IA Especialista) ✅ [checkpoint]
- **Integração OpenAI (chave do gestor)**: `OPENAI_API_KEY`/`OPENAI_MODEL` (gpt-4o-mini) no backend/.env; cliente `AsyncOpenAI`
  lazy. A chave nunca vai ao frontend.
- **Campos técnicos por loteamento** (aditivo no doc `loteamentos`): `fields[]` ({id,label,value}), `copy`, `ai_training`.
  Rotas: GET/PUT `/loteamentos/{id}/details` (PUT só master), POST `/loteamentos/{id}/ai` (qualquer autenticado).
- **IA Especialista**: system prompt em pt-BR usando SOMENTE os campos técnicos + treino + copy; recusa (sem inventar)
  quando a info não existe. Multi-turn (history até 12 msgs), temp 0.2, max_tokens 700.
- **Lembrete mensal (dia 3)**: cron `lot-reminder` ("0 12 3 * *") → `/api/cron/lot-reminder` notifica o gestor p/ atualizar
  as tabelas/dados técnicos dos loteamentos.
- Frontend `LoteamentoDetailsDialog` (botão ✨ em Equipe › Loteamentos): aba "Dados & Copy" com campos técnicos
  **drag-and-drop** (HTML5 nativo, sem lib), sugestões de campos, Copy e "Treinar a IA"; aba "IA Especialista" com chat.
- Testado: save details + IA no contexto ("metragem 250 m², aceita financiamento") e fora do contexto (recusa); cron 401/200;
  UI (screenshot gestor): 3 campos carregados, drag handles, chat respondendo "status da obra".
- PENDENTE: FASE 9 (testes finais E2E). REPUBLICAR p/ produção.

### Iteração 30 (2026-06 fork) — Loteamento estruturado + Copy IA + Mapeamento na importação ✅ [checkpoint]
**Informações do loteamento (estruturado, sem digitação solta):**
- Campo `specs` (objeto estruturado, aditivo no MESMO doc `loteamentos` — sem DB paralela). Seções: tecnicos
  (metragem min/max, área, qtd lotes/quadras, tipo aberto/fechado, liberação %, prazo, restrições), infraestrutura
  (checkbox múltiplo com 21 opções + "Outro"), obra (status + campos condicionais %/previsão/data/obs),
  localizacao (cidade/estado/bairro/endereço/maps/distâncias/acessos), comercial (valor a partir + referência SEPARADOS,
  entrada, parcelas, financiamento, correção IPCA/IGP-M/outro + periodicidade, juros com→% + embutidos=Price / não embutidos=SAC,
  balão possui→campos, condições especiais, diferenciais).
- Frontend `LoteamentoSpecsForm.jsx`: Accordion com Select/RadioGroup/Checkbox e campos condicionais (só aparecem quando a
  opção é selecionada). `LoteamentoDetailsDialog` reescrito: aba Informações (specs + Copy + Treino) e aba IA. Mostra
  "última atualização" (`details_updated_at`).
- `_lot_specs_to_text()` converte specs em texto legível e alimenta a IA Especialista E a geração de Copy.
**Copy com 1 clique:** POST `/loteamentos/{id}/generate-copy` (OpenAI) gera texto de divulgação p/ WhatsApp/Instagram SÓ com
  os dados cadastrados; botão "Gerar com IA" (salva antes) + botão Copiar.
**Importação — sugestão de mapeamento por IA:** preview agora retorna `column_mapping` (Gemini mapeia cada cabeçalho da
  planilha → campo canônico via `_ai_suggest_mapping`/`_read_headers`); ImportDialog exibe "Sugestão de mapeamento da IA".
- Testado (curl): specs salvam (tipo/infra/updated); IA deriva "0,5% embutidos → Tabela Price, IPCA anual"; copy gerada
  coerente; mapeamento mapeou 9/9 colunas (Empreendimento→Loteamento, CPF→CPF, Nascimento→Data de nascimento...).
  UI (screenshot gestor): formulário estruturado carregando valores, 5 infra marcadas, seções e condicionais OK.
- CONTINUA NA ITERAÇÃO 31 (Galeria, Copy por canal e Fase 9).

### Iteração 31 (2026-06 fork) — Galeria + Copy por canal + Mapeamento IA + FASE 9 E2E ✅
**Galeria do loteamento (fotos/plantas):** coleção `lot_images` (base64, mesmo padrão dos anexos). Rotas POST/GET
  `/loteamentos/{id}/images` (upload multipart com `type` foto/planta e `caption` via Form), GET `/loteamentos/images/{id}/raw`
  (serve bytes, auth por cookie), PATCH/DELETE. Frontend `LoteamentoGallery.jsx` (aba Galeria): upload múltiplo com
  compressão client-side (max 1600px), grade de thumbs, tipo + descrição (salva no blur), excluir. Descrições alimentam a IA
  e as copys (`_lot_gallery_text` entra no contexto de `/ai` e `/generate-copy`).
**Copy por canal:** `/generate-copy?channel=stories|feed|whatsapp` com prompts distintos (`_COPY_CHANNELS`); WhatsApp inclui o
  contato do corretor logado. UI: 3 botões Stories/Feed/WhatsApp + Copiar.
**FASE 9 — E2E completo:** testing_agent 100% (backend 24/24 pytest em `tests/test_phase9_e2e.py` + UI). Cobriu vendas+comemoração,
  ranking opt-out, agenda CRUD, WhatsApp aniversário, export por colunas, specs estruturado, copy 3 canais, galeria, IA
  (responde/recusa), importação. Dados de teste limpos.
**Hardening:** `_lot_specs_to_text` coage `isinstance(str)` em tipo/status/correção/periodicidade — specs malformado (dict em vez
  de string) não derruba mais `/ai` nem `/generate-copy` (antes 500 → agora 200). Validado por curl.
- TUDO PRONTO (Fases 1–9). PENDENTE APENAS: **REPUBLICAR** p/ produção (inclui a chave OpenAI no .env de produção).

### Iteração 32 (2026-06 fork) — Área Loteamentos dedicada + Ranking por loteamento ✅
- **Feedback do usuário**: a gestão de loteamentos estava "escondida" em Equipe › Loteamentos (só nome p/ vendas). Ele pediu
  uma ABA própria para cadastrar o loteamento COM as informações + IA.
- **Área Loteamentos dedicada**: novo botão "Loteamentos" (Building2) no header do gestor → `LoteamentosDialog.jsx`:
  lista todos os loteamentos (busca, adicionar, remover) e botão "Gerenciar" (✨) por loteamento que abre o
  `LoteamentoDetailsDialog` completo (abas Informações estruturadas + Galeria + IA Especialista + Copy por canal).
- **Ranking por loteamento**: novo GET `/api/ranking/loteamentos` (agrega vendas por property_name: qtd + VGV, respeita
  month/year/start/end). `RankingCard` ganhou alternância **Corretores | Loteamentos** (data-testid ranking-scope-brokers/loteamentos).
- **Header**: botão "Comissões" renomeado para **"Financeiro"** (abre o hub Extrato/Agenda). [Consolidação total de
  Relatórios/Projeção no hub Financeiro = próximo passo, a confirmar com o usuário.]
- Validado: backend `/ranking/loteamentos` (14 loteamentos ordenados por VGV); UI (screenshot gestor): botão Loteamentos →
  27 cards → Gerenciar abre o cadastro completo (Informações/Galeria/IA); ranking alternando p/ Loteamentos (Casa Praia Grande 1º).
- IMPORTANTE: tudo em PREVIEW. App publicado ainda é a versão antiga → **REPUBLICAR** para refletir no app ao vivo.

### Iteração 35 (2026-06 fork) — Base do Financeiro Avançado documentada + publicação
- **Base recebida (mockups ARTE 04-07 + Relatório de comissões)**: Comissões já existem (Extrato/Agenda/Baixas/Lançamento/Dar baixa em CommissionsDialog + SaleFormDialog). NOVO a construir = **"Relatório de comissões" consolidado**:
  tabela única com Data, Loteamento, Qd, Lt, Corretor, Valor do lote, %, Comissão, Desc. NF/boleto, Líquido, Parc. (x/n),
  Pago, Saldo, Status (Pendente/Parcial/Paga), Obs.; filtros Período/Loteamento/Corretor/Status + Agrupar (Loteamento>Quadra)
  + seletor de Colunas; export PDF/Excel; **edição inline de % e desconto com histórico de auditoria**; resumo (Vendas,
  Comissão gerada, Recebida, A receber). [P0 PRÓXIMA RODADA]
- Pendências do mockup Loteamentos: ARTE 13 (abas Vídeos/Mapa + "Abas visíveis p/ corretores"), ARTE 17 (Config OpenAI:
  trocar chave/modelo/limite/uso), anexar PDF na Base IA, "Organizar ordem" (drag) na lista. [P1]
- Ação: publicando o estado atual (tudo das iterações 26-34). Financeiro avançado fica para a próxima rodada.

### Iteração 36 (2026-06 fork) — Relatório de Comissões consolidado + CPF/Nascimento do corretor ✅
- **Relatório de Comissões (P0)**: nova aba "Relatório" (padrão) no hub Financeiro (CommissionsReport.jsx). Tabela única:
  Data · Loteamento · Qd · Lt · Corretor · Valor · % · Comissão · Desc. NF/boleto · Líquido · Parcelas (x/n) · Pago · Saldo · Status (Pendente/Parcial/Paga).
  Resumo no topo (Vendas / Comissão gerada / Recebida / A receber). Filtros Ano/Mês/Loteamento/Corretor/Status.
  **Agrupar por loteamento** + **seletor de colunas** (popover). Export PDF/Excel (respeita colunas). **Edição inline** de % e
  Desc. NF/boleto (só master) salvando na própria venda com recálculo (bruta/líquida) e **auditoria** (action `commission_edit`).
- Backend: GET `/commissions/report` ({rows,summary,can_edit}, escopado por corretor), `/commissions/report/xlsx` e
  `/commissions/report/pdf` (param `columns`), PATCH `/sales/{id}/commission` (master; grava desconto tipo `nf_boleto`).
- **CPF + Data de nascimento do corretor**: adicionados ao model CorretorProfile e às rotas POST/PUT `/corretores`; form
  TeamDialog/CorretorForm (broker-cpf / broker-birthdate) e exibição no card (broker-cpf-<uid> / broker-birthdate-<uid>).
  (BrokersDialog.jsx removido — era dead code.)
- **Baixa de parcela**: opção de **anexar comprovante** (InstallmentsDialog → baixa-receipt-btn/-input); persiste em payments[].receipt/receipt_name; badge "Comprovante anexado".
- Testado: testing_agent — backend 15/15 pytest (report + corretor cpf/birthdate) e frontend 100% (iteration_13/14.json). **REPUBLICAR** p/ produção.

### Iteração 37 (2026-06 fork) — Loteamento Vídeos/Mapa/Documentos + reorder + Mapa geral + seleção em lote ✅
- **Object storage (Emergent)**: helpers `_init_storage/_put_object/_get_object` (usa EMERGENT_LLM_KEY) p/ uploads de vídeo e documentos.
- **Vídeos do loteamento**: `lot_videos` + endpoints `/loteamentos/{id}/videos` (GET), `/videos/link` (YouTube/URL, detecta youtube_id), `/videos/upload` (arquivo, object storage), `/videos/{vid}/raw` (stream), DELETE (soft). Frontend `LoteamentoVideos.jsx` (aba Vídeos).
- **Documentos (PDF/Tabela de preço p/ corretor baixar)**: `lot_docs` + `/loteamentos/{id}/docs` (GET/POST), `/docs/{id}/download` (attachment), DELETE (soft). Categorias: documento, tabela_preco. Frontend `LoteamentoDocs.jsx` (aba Documentos).
- **Mapa (Google Maps)**: chave em `REACT_APP_GOOGLE_MAPS_API_KEY`. `lib/gmaps.js` (loader). Aba Mapa por loteamento (`LoteamentoMap.jsx`) a partir de lat/lng; `GeneralMapDialog.jsx` = aba "Mapa geral" (botão lot-open-map) com marcadores de todos os lotes → clique abre detalhes. Coordenadas: campo `specs.localizacao.coords` ou link do Maps → `_parse_latlng` grava lat/lng top-level (exposto em `/loteamentos`).
- **Reorder**: POST `/loteamentos/reorder` {ids}; setas ↑/↓ nos cards (quando filtro=Todos e sem busca).
- **Seleção múltipla no Dashboard (gestor)**: checkboxes por linha + selecionar todos; barra com Excluir/Transferir em lote → POST `/sales/bulk-delete` e `/sales/bulk-transfer` (master).
- Testado: testing_agent — backend 22/22 pytest + frontend 100% (iteration_15.json). ⚠️ No preview o Google Maps pode cair em erro por **restrição de referrer da chave** — adicionar os domínios preview+produção nas restrições da chave Google. **REPUBLICAR** p/ produção.
- PENDENTE P1 restante: ARTE 17 (tela de Config OpenAI: trocar chave/modelo/limite/uso), "abas visíveis p/ corretores" + **catálogo de loteamentos para o corretor** (hoje só o gestor vê vídeos/docs/mapa).

### Iteração 38 (2026-06 fork) — Catálogo de Loteamentos para o Corretor (somente leitura) ✅
- **Catálogo do corretor**: botão "Loteamentos" no header do corretor → `CorretorLoteamentosDialog.jsx` (lista read-only: busca, filtros, Mapa geral) → `CorretorLoteamentoView.jsx` com abas Resumo (specs + copy de divulgação), Galeria, Vídeos, Mapa, Documentos (baixar), Copys (copiar) e IA (chat).
- **readOnly**: props `readOnly` em LoteamentoGallery/Videos/Copys e `canManage=false` em LoteamentoDocs escondem toda a edição p/ o corretor; o gestor (LoteamentoDetailsDialog) mantém edição total. Backend já bloqueia mutações com `require_master` (defense-in-depth).
- **Google Maps**: loader `lib/gmaps.js` corrigido (removido `loading=async` que quebrava o `new Map`). Chave `AIza...` é **válida** e carrega o Maps JS, mas tem **restrição de referrer** → no preview dá `RefererNotAllowedMapError`. É preciso autorizar os domínios (preview + produção) nas restrições da chave no Google Cloud Console (e ter o "Maps JavaScript API" ativo + billing).
- Testado: testing_agent — backend 17/17 pytest + frontend 100% (iteration_16.json). **REPUBLICAR** p/ produção.

### Iteração 39 (2026-06 fork) — Config da IA (chave/modelo/limite/uso) + Abas visíveis por corretor ✅
- **Config da IA (ARTE 17)**: coleção `app_settings` (id="ai"). GET/PUT `/settings/ai` (master): trocar chave OpenAI (nunca exibida, só mascarada), modelo, **limite mensal** de solicitações e ver **uso** (requests+tokens do mês); `reset_usage`. As 3 chamadas de IA agora usam chave/modelo efetivos (custom do settings OU env), checam o limite (429 ao estourar) e registram uso. Frontend `AiSettingsDialog.jsx` + botão "IA" (btn-open-ai-settings) no header do gestor.
- **Abas visíveis por corretor**: `visible_tabs` no doc do loteamento (default todas). PATCH `/loteamentos/{id}/meta` aceita `visible_tabs`; exposto em list/details. Gestor define via popover "Abas visíveis p/ corretor" (lot-visibility-btn) no LoteamentoDetailsDialog; o CorretorLoteamentoView só mostra as abas liberadas (Resumo sempre).
- Testado: testing_agent — backend 10/10 (+1 skip por design) + frontend 100% (iteration_17.json). **REPUBLICAR** p/ produção. ✅ **Todos os itens P1 do mockup concluídos.**

### Iteração 34 (2026-06 fork) — Copys por categoria + Base de conhecimento IA + Perguntas sem resposta ✅
- **Copys por categoria (ARTE 14)**: `copies[]` no doc loteamento. POST/PUT/DELETE `/loteamentos/{id}/copies` + POST
  `/loteamentos/{id}/copies/generate` {category, channel} (IA gera por categoria usando specs+galeria+conhecimento).
  Frontend `LoteamentoCopys.jsx` (aba "Copys"): criar/gerar com IA/copiar/excluir, filtro por categoria (Localização/Valores/Infraestrutura/Geral).
- **Base de conhecimento da IA (ARTE 16)**: `knowledge[]` no doc. POST/DELETE `/loteamentos/{id}/knowledge` (tipos texto/link/qa).
  `_lot_knowledge_text` entra no contexto da IA e da geração de copy. Frontend `LoteamentoKnowledge.jsx` (aba "Base IA").
- **Perguntas sem resposta (ARTE 16)**: quando o CORRETOR pergunta algo fora dos dados, a IA recusa e a pergunta é registrada
  em `questions[]`; gestor é notificado (lot_question). GET `/loteamentos/{id}/questions` + POST `.../answer` → resposta vira
  conhecimento Q&A e marca a pergunta como respondida.
- Validado (curl): add/gerar/excluir copy; add knowledge; corretor pergunta "taxa de condomínio" → IA recusa → pergunta logada
  (Carlão) → gestor vê em "Perguntas sem resposta"; responder vira conhecimento. UI (screenshot): abas Copys e Base IA OK. Dados limpos.
- PENDENTE do mockup (próximo): Configurações OpenAI (ARTE 17: trocar chave/modelo/limite/uso), abas Vídeos/Mapa +
  "Abas visíveis p/ corretores" (ARTE 13), "Organizar ordem" (drag) na lista, anexar PDF na Base IA. **REPUBLICAR** p/ produção.

### Iteração 33 (2026-06 fork) — Lista de Loteamentos no estilo do mockup (ARTE 12) ✅
- Usuário enviou mockups (Folhas 5 e 6) com o design-alvo da área Loteamentos (lista com status/foto/ordenar; abas
  Fotos/Vídeos/Mapa/Informações/Copys; Copys por categoria; IA "O que a IA sabe" com PDFs/links/Q&A; tela OpenAI).
- Entregue nesta iteração (ARTE 12): `LoteamentosDialog` redesenhado — cards com **foto de capa** (1ª imagem da galeria),
  **selo de fase** (Em vendas/Lançamento/Entregue), cidade (de specs.localizacao), seletor de fase inline, **Ver detalhes**,
  **filtros** (Todos/Em vendas/Lançamentos/Entregues) e busca por nome/cidade.
- Backend: `phase` no doc loteamento + PATCH `/loteamentos/{id}/meta` (phase/order); `list_loteamentos` enriquecido com
  phase, cidade e cover (1ª imagem). Validado por curl + screenshot (27 cards, filtros, status).
- PENDENTE (do mockup, grande): Copys por categoria (ARTE 14), IA "O que a IA sabe" — anexar PDF/link/texto/Q&A + fila de
  "Perguntas sem resposta" (ARTE 15-16), tela de Configurações OpenAI com troca de chave/modelo/limite/uso (ARTE 17),
  e abas Vídeos/Mapa + "Abas visíveis para corretores" (ARTE 13). **REPUBLICAR** p/ ver no app ao vivo.

## Backlog (P1/P2)
- P1: Acesso individual por corretor (login) + previsão de recebimento de comissão por corretor.
- P1: Exportação CSV/PDF dos relatórios.
- P1: Split de comissão por venda na importação (hoje fixo 60/40) + erros por linha no import.
- P2: Filtro de período personalizado (intervalo de datas).
- P2: Metas mensais por corretor; alerta de parcelas vencendo.
- P2: Foto de corretor via object storage (hoje base64 no documento).

## Próximas tarefas sugeridas
- Exportar relatório do período em PDF/CSV.
- Metas mensais e alerta de parcelas vencendo.
