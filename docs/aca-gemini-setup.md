# Azure Container Apps - 環境設定手順

## 概要

| 設定の種類 | 方法 | 理由 |
|---|---|---|
| `NEXT_PUBLIC_*` | Dockerfile の ARG（ビルド時） | クライアントバンドルに焼き込みが必要 |
| APIキー・サーバー設定 | ACA 環境変数（ランタイム） | シークレット管理・再ビルド不要 |

---

## 1. シークレット登録

```bash
az containerapp secret set \
  --name megaro-aituber \
  --resource-group megaro-aituber-prod-rg \
  --secrets google-api-key=<YOUR_GOOGLE_API_KEY>
```

> API キーの取得: https://aistudio.google.com/apikey

---

## 2. ランタイム環境変数の設定

`NEXT_PUBLIC_*` 以外の設定はここで行います（再ビルド不要）。

```bash
az containerapp update \
  --name megaro-aituber \
  --resource-group megaro-aituber-prod-rg \
  --set-env-vars \
    GOOGLE_API_KEY=secretref:google-api-key \
    VOICEVOX_SERVER_URL=http://20.194.192.27:50021
```

> **VOICEVOX_SERVER_URL** はサーバー側で読まれるため、ランタイム設定が有効です。
> VM の IP が変わった場合もここだけ更新すれば再ビルド不要です。

---

## 3. ビルド時設定（Dockerfile ARG）

`NEXT_PUBLIC_*` はビルド時に焼き込まれます。`Dockerfile` の ARG で管理しています：

```dockerfile
ARG NEXT_PUBLIC_SELECT_AI_SERVICE=google
ARG NEXT_PUBLIC_SELECT_AI_MODEL=gemini-2.5-flash-lite
ARG NEXT_PUBLIC_SELECT_VOICE=voicevox
ARG NEXT_PUBLIC_SELECT_LANGUAGE=ja
ARG NEXT_PUBLIC_ALWAYS_OVERRIDE_WITH_ENV_VARIABLES=true
```

変更する場合は Dockerfile を修正して再デプロイしてください。

---

## 4. 確認

```bash
az containerapp show \
  --name megaro-aituber \
  --resource-group megaro-aituber-prod-rg \
  --query "properties.template.containers[0].env"
```
