// MedSync8 — Azure Container Apps deployment
// Resources: Log Analytics, Storage (Azure Files), Container Apps env, Container App.
//
// Deploy manually:
//   az group create -n medsync8-rg -l eastus
//   az deployment group create \
//     -g medsync8-rg \
//     --template-file azure/main.bicep \
//     --parameters azure/parameters.json
//
// Or let the GitHub Actions workflow (deploy-azure.yml) handle it.

targetScope = 'resourceGroup'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Short name prefix (max 12 chars) — used to derive all resource names')
@maxLength(12)
param appName string = 'medsync8'

@description('Full container image reference (e.g. ghcr.io/org/MedSync8:sha-abc123)')
param containerImage string

@description('GitHub username or org that owns the GHCR package')
param ghcrUsername string

@secure()
@description('GitHub PAT with read:packages scope — used by Container Apps to pull the image')
param ghcrToken string

@secure()
@description('Anthropic API key')
param anthropicApiKey string

@secure()
@description('Random hex string for audit log salt — rotate to unlink old query hashes')
param auditSalt string

param cfAccessTeamDomain string = ''
param cfAccessAud string = ''

@description('Comma-separated list of allowed frontend origins for CORS')
param allowedOrigins string = '*'

param anthropicModel string = 'claude-opus-4-6'
param embedBackend string = 'local'
param ragTopK string = '4'

// Strip hyphens for storage account name (alphanumeric only, max 24 chars)
var safeAppName = replace(toLower(appName), '-', '')

// ── Log Analytics ────────────────────────────────────────────────────────────

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${appName}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 90
  }
}

// ── Storage (Azure Files — /data volume) ─────────────────────────────────────

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: '${safeAppName}data'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileService
  name: 'data'
  properties: { shareQuota: 5 }  // 5 GB — holds corpus + audit log
}

// ── Key Vault (runtime secret source) ─────────────────────────────────────────
// Secure params seed the vault at deploy time; the Container App reads secrets
// at runtime via a user-assigned managed identity — secrets never sit in
// Container Apps configuration as plain values.

resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${appName}-identity'
  location: location
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: take('${safeAppName}kv${uniqueString(resourceGroup().id)}', 24)
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
  }
}

resource kvAnthropicKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'anthropic-api-key'
  properties: { value: anthropicApiKey }
}

resource kvAuditSalt 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'audit-salt'
  properties: { value: auditSalt }
}

resource kvGhcrToken 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'ghcr-token'
  properties: { value: ghcrToken }
}

// Key Vault Secrets User — lets the app identity read (not manage) secrets.
resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, uami.id, 'kv-secrets-user')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6' // Key Vault Secrets User
    )
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Container Apps Environment ────────────────────────────────────────────────

resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${appName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// Mount the Azure Files share into the environment so the Container App can use it.
resource dataStorage 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: containerEnv
  name: 'data'
  properties: {
    azureFile: {
      accountName: storageAccount.name
      accountKey: storageAccount.listKeys().keys[0].value
      shareName: fileShare.name
      accessMode: 'ReadWrite'
    }
  }
}

// ── Container App ─────────────────────────────────────────────────────────────

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${uami.id}': {}
    }
  }
  // Secret references resolve at runtime — the role assignment must exist first.
  dependsOn: [kvSecretsUser]
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      // Pull image from GitHub Container Registry.
      registries: [
        {
          server: 'ghcr.io'
          username: ghcrUsername
          passwordSecretRef: 'ghcr-token'
        }
      ]
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
        allowInsecure: false
      }
      secrets: [
        { name: 'anthropic-api-key', keyVaultUrl: kvAnthropicKey.properties.secretUri, identity: uami.id }
        { name: 'audit-salt', keyVaultUrl: kvAuditSalt.properties.secretUri, identity: uami.id }
        { name: 'ghcr-token', keyVaultUrl: kvGhcrToken.properties.secretUri, identity: uami.id }
      ]
    }
    template: {
      containers: [
        {
          name: appName
          image: containerImage
          // bge-small-en-v1.5 needs ~400 MB resident; 2 Gi gives comfortable headroom.
          resources: { cpu: json('1.0'), memory: '2Gi' }
          env: [
            { name: 'ANTHROPIC_API_KEY', secretRef: 'anthropic-api-key' }
            { name: 'AUDIT_SALT', secretRef: 'audit-salt' }
            { name: 'PORT', value: '8080' }
            { name: 'CORPUS_DIR', value: '/data/corpus' }
            { name: 'AUDIT_LOG_PATH', value: '/data/audit.log' }
            { name: 'ANTHROPIC_MODEL', value: anthropicModel }
            { name: 'EMBED_BACKEND', value: embedBackend }
            { name: 'RAG_TOP_K', value: ragTopK }
            { name: 'ALLOWED_ORIGINS', value: allowedOrigins }
            { name: 'CF_ACCESS_TEAM_DOMAIN', value: cfAccessTeamDomain }
            { name: 'CF_ACCESS_AUD', value: cfAccessAud }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/api/health', port: 8080, scheme: 'HTTP' }
              initialDelaySeconds: 30
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: { path: '/api/health', port: 8080, scheme: 'HTTP' }
              initialDelaySeconds: 10
              periodSeconds: 10
            }
          ]
          volumeMounts: [
            { volumeName: 'data', mountPath: '/data' }
          ]
        }
      ]
      scale: {
        minReplicas: 0   // scale to zero when idle
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: { metadata: { concurrentRequests: '10' } }
          }
        ]
      }
      volumes: [
        {
          name: 'data'
          storageType: 'AzureFile'
          storageName: dataStorage.name
        }
      ]
    }
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

output appUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output containerAppName string = containerApp.name
output resourceGroupName string = resourceGroup().name
