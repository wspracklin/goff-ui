{{/*
Expand the name of the chart.
*/}}
{{- define "goff-manager.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "goff-manager.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "goff-manager.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "goff-manager.labels" -}}
helm.sh/chart: {{ include "goff-manager.chart" . }}
{{ include "goff-manager.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "goff-manager.selectorLabels" -}}
app.kubernetes.io/name: {{ include "goff-manager.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
API specific labels
*/}}
{{- define "goff-manager.api.labels" -}}
{{ include "goff-manager.labels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
API selector labels
*/}}
{{- define "goff-manager.api.selectorLabels" -}}
{{ include "goff-manager.selectorLabels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
UI specific labels
*/}}
{{- define "goff-manager.ui.labels" -}}
{{ include "goff-manager.labels" . }}
app.kubernetes.io/component: ui
{{- end }}

{{/*
UI selector labels
*/}}
{{- define "goff-manager.ui.selectorLabels" -}}
{{ include "goff-manager.selectorLabels" . }}
app.kubernetes.io/component: ui
{{- end }}

{{/*
Relay Proxy specific labels
*/}}
{{- define "goff-manager.relayProxy.labels" -}}
{{ include "goff-manager.labels" . }}
app.kubernetes.io/component: relay-proxy
{{- end }}

{{/*
Relay Proxy selector labels
*/}}
{{- define "goff-manager.relayProxy.selectorLabels" -}}
{{ include "goff-manager.selectorLabels" . }}
app.kubernetes.io/component: relay-proxy
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "goff-manager.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "goff-manager.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
API fullname
*/}}
{{- define "goff-manager.api.fullname" -}}
{{- printf "%s-api" (include "goff-manager.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
UI fullname
*/}}
{{- define "goff-manager.ui.fullname" -}}
{{- printf "%s-ui" (include "goff-manager.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Relay Proxy fullname
*/}}
{{- define "goff-manager.relayProxy.fullname" -}}
{{- printf "%s-relay" (include "goff-manager.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
PVC name for API
*/}}
{{- define "goff-manager.api.pvcName" -}}
{{- if .Values.api.persistence.existingClaim }}
{{- .Values.api.persistence.existingClaim }}
{{- else }}
{{- printf "%s-flags" (include "goff-manager.api.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Secret name for API
*/}}
{{- define "goff-manager.api.secretName" -}}
{{- if .Values.api.git.existingSecret }}
{{- .Values.api.git.existingSecret }}
{{- else }}
{{- printf "%s-git" (include "goff-manager.api.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Secret name for UI
*/}}
{{- define "goff-manager.ui.secretName" -}}
{{- if .Values.ui.existingSecret }}
{{- .Values.ui.existingSecret }}
{{- else }}
{{- printf "%s-auth" (include "goff-manager.ui.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Secret name for Relay Proxy
*/}}
{{- define "goff-manager.relayProxy.secretName" -}}
{{- if .Values.relayProxy.existingSecret }}
{{- .Values.relayProxy.existingSecret }}
{{- else }}
{{- printf "%s-keys" (include "goff-manager.relayProxy.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
ConfigMap name for Relay Proxy
*/}}
{{- define "goff-manager.relayProxy.configMapName" -}}
{{- printf "%s-config" (include "goff-manager.relayProxy.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Internal URL for API service
*/}}
{{- define "goff-manager.api.internalUrl" -}}
{{- printf "http://%s:%d" (include "goff-manager.api.fullname" .) (int .Values.api.service.port) }}
{{- end }}

{{/*
Internal URL for Relay Proxy service
*/}}
{{- define "goff-manager.relayProxy.internalUrl" -}}
{{- printf "http://%s:%d" (include "goff-manager.relayProxy.fullname" .) (int .Values.relayProxy.service.port) }}
{{- end }}

{{/*
Namespace to use
*/}}
{{- define "goff-manager.namespace" -}}
{{- default .Release.Namespace .Values.namespace }}
{{- end }}

{{/*
Image pull secrets
*/}}
{{- define "goff-manager.imagePullSecrets" -}}
{{- with .Values.global.imagePullSecrets }}
imagePullSecrets:
{{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}

{{/*
Storage class for PVCs
*/}}
{{- define "goff-manager.storageClass" -}}
{{- if .Values.api.persistence.storageClass }}
{{- .Values.api.persistence.storageClass }}
{{- else if .Values.global.storageClass }}
{{- .Values.global.storageClass }}
{{- else }}
{{- "" }}
{{- end }}
{{- end }}
