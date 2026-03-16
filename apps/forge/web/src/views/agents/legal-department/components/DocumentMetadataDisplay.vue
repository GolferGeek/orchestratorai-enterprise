<template>
  <div class="document-metadata-display">
    <div class="metadata-header">
      <ion-icon :icon="documentTextOutline" />
      <h3>Document Metadata</h3>
      <ion-badge :color="getConfidenceColor(metadata.confidence.overall)">
        {{ (metadata.confidence.overall * 100).toFixed(0) }}% Overall Confidence
      </ion-badge>
    </div>

    <!-- Document Type -->
    <div class="metadata-section">
      <div class="section-title">
        <ion-icon :icon="folderOutline" />
        <h4>Document Type</h4>
      </div>
      <div class="document-type-card">
        <div class="type-header">
          <ion-badge color="secondary">{{ formatDocumentType(metadata.documentType.type) }}</ion-badge>
          <span class="confidence-text">
            {{ (metadata.documentType.confidence * 100).toFixed(0) }}% confidence
          </span>
        </div>
        <p v-if="metadata.documentType.reasoning" class="type-reasoning">
          {{ metadata.documentType.reasoning }}
        </p>
        <div v-if="metadata.documentType.alternatives && metadata.documentType.alternatives.length > 0" class="alternatives">
          <span class="alternatives-label">Alternatives:</span>
          <ion-badge
            v-for="alt in metadata.documentType.alternatives"
            :key="alt.type"
            color="medium"
            class="alternative-badge"
          >
            {{ formatDocumentType(alt.type) }} ({{ (alt.confidence * 100).toFixed(0) }}%)
          </ion-badge>
        </div>
      </div>
    </div>

    <!-- Sections -->
    <div class="metadata-section">
      <div class="section-title">
        <ion-icon :icon="listOutline" />
        <h4>Document Structure</h4>
        <ion-badge :color="getStructureColor(metadata.sections.structureType)">
          {{ metadata.sections.structureType }}
        </ion-badge>
      </div>
      <div v-if="metadata.sections.sections.length === 0" class="empty-state">
        <p>No sections detected</p>
      </div>
      <div v-else class="sections-list">
        <div
          v-for="(section, index) in metadata.sections.sections"
          :key="index"
          class="section-item"
        >
          <div class="section-header">
            <ion-badge color="secondary">{{ formatSectionType(section.type) }}</ion-badge>
            <span class="section-title-text">{{ section.title }}</span>
            <span class="section-confidence">
              {{ (section.confidence * 100).toFixed(0) }}%
            </span>
          </div>
          <div v-if="section.clauses && section.clauses.length > 0" class="clauses-list">
            <span class="clauses-label">Clauses: {{ section.clauses.length }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Signatures -->
    <div class="metadata-section">
      <div class="section-title">
        <ion-icon :icon="createOutline" />
        <h4>Signatures</h4>
        <ion-badge v-if="metadata.signatures.partyCount > 0" color="tertiary">
          {{ metadata.signatures.partyCount }} {{ metadata.signatures.partyCount === 1 ? 'party' : 'parties' }}
        </ion-badge>
      </div>
      <div v-if="metadata.signatures.signatures.length === 0" class="empty-state">
        <p>No signatures detected</p>
      </div>
      <div v-else class="signatures-list">
        <div
          v-for="(signature, index) in metadata.signatures.signatures"
          :key="index"
          class="signature-item"
        >
          <div class="signature-content">
            <div v-if="signature.partyName" class="signature-field">
              <strong>Party:</strong> {{ signature.partyName }}
            </div>
            <div v-if="signature.signerName" class="signature-field">
              <strong>Signer:</strong> {{ signature.signerName }}
            </div>
            <div v-if="signature.signerTitle" class="signature-field">
              <strong>Title:</strong> {{ signature.signerTitle }}
            </div>
            <div v-if="signature.signatureDate" class="signature-field">
              <strong>Date:</strong> {{ signature.signatureDate }}
            </div>
          </div>
          <div class="signature-confidence">
            {{ (signature.confidence * 100).toFixed(0) }}% confidence
          </div>
        </div>
      </div>
    </div>

    <!-- Dates -->
    <div class="metadata-section">
      <div class="section-title">
        <ion-icon :icon="calendarOutline" />
        <h4>Key Dates</h4>
      </div>
      <div v-if="metadata.dates.dates.length === 0" class="empty-state">
        <p>No dates extracted</p>
      </div>
      <div v-else class="dates-list">
        <div
          v-for="(date, index) in metadata.dates.dates"
          :key="index"
          class="date-item"
          :class="{ 'primary-date': date === metadata.dates.primaryDate }"
        >
          <div class="date-content">
            <ion-badge :color="date === metadata.dates.primaryDate ? 'primary' : 'medium'">
              {{ formatDateType(date.dateType) }}
            </ion-badge>
            <span class="date-value">{{ date.normalizedDate }}</span>
            <span v-if="date.originalText !== date.normalizedDate" class="date-original">
              ({{ date.originalText }})
            </span>
          </div>
          <div class="date-confidence">
            {{ (date.confidence * 100).toFixed(0) }}%
          </div>
        </div>
      </div>
    </div>

    <!-- Parties -->
    <div class="metadata-section">
      <div class="section-title">
        <ion-icon :icon="peopleOutline" />
        <h4>Parties</h4>
      </div>
      <div v-if="metadata.parties.parties.length === 0" class="empty-state">
        <p>No parties detected</p>
      </div>
      <div v-else class="parties-list">
        <div
          v-for="(party, index) in metadata.parties.parties"
          :key="index"
          class="party-item"
          :class="{ 'contracting-party': isContractingParty(party) }"
        >
          <div class="party-content">
            <div class="party-name">
              {{ party.name }}
              <ion-badge v-if="isContractingParty(party)" color="success" class="contracting-badge">
                Primary
              </ion-badge>
            </div>
            <div class="party-details">
              <ion-badge color="medium">{{ formatPartyType(party.type) }}</ion-badge>
              <span v-if="party.role" class="party-role">
                {{ formatPartyRole(party.role) }}
              </span>
            </div>
            <div v-if="party.identifiers" class="party-identifiers">
              <div v-if="party.identifiers.address" class="identifier-item">
                <ion-icon :icon="locationOutline" />
                {{ party.identifiers.address }}
              </div>
              <div v-if="party.identifiers.registrationNumber" class="identifier-item">
                <ion-icon :icon="businessOutline" />
                {{ party.identifiers.registrationNumber }}
              </div>
            </div>
          </div>
          <div class="party-confidence">
            {{ (party.confidence * 100).toFixed(0) }}%
          </div>
        </div>
      </div>
    </div>

    <!-- Confidence Breakdown -->
    <div class="metadata-section">
      <div class="section-title">
        <ion-icon :icon="analyticsOutline" />
        <h4>Confidence Breakdown</h4>
      </div>
      <div class="confidence-grid">
        <div v-if="metadata.confidence.breakdown.documentType" class="confidence-item">
          <span class="confidence-label">Document Type</span>
          <div class="confidence-bar">
            <div
              class="confidence-fill"
              :style="{ width: `${metadata.confidence.breakdown.documentType * 100}%` }"
            />
          </div>
          <span class="confidence-value">
            {{ (metadata.confidence.breakdown.documentType * 100).toFixed(0) }}%
          </span>
        </div>
        <div v-if="metadata.confidence.breakdown.sections" class="confidence-item">
          <span class="confidence-label">Sections</span>
          <div class="confidence-bar">
            <div
              class="confidence-fill"
              :style="{ width: `${metadata.confidence.breakdown.sections * 100}%` }"
            />
          </div>
          <span class="confidence-value">
            {{ (metadata.confidence.breakdown.sections * 100).toFixed(0) }}%
          </span>
        </div>
        <div v-if="metadata.confidence.breakdown.signatures" class="confidence-item">
          <span class="confidence-label">Signatures</span>
          <div class="confidence-bar">
            <div
              class="confidence-fill"
              :style="{ width: `${metadata.confidence.breakdown.signatures * 100}%` }"
            />
          </div>
          <span class="confidence-value">
            {{ (metadata.confidence.breakdown.signatures * 100).toFixed(0) }}%
          </span>
        </div>
        <div v-if="metadata.confidence.breakdown.dates" class="confidence-item">
          <span class="confidence-label">Dates</span>
          <div class="confidence-bar">
            <div
              class="confidence-fill"
              :style="{ width: `${metadata.confidence.breakdown.dates * 100}%` }"
            />
          </div>
          <span class="confidence-value">
            {{ (metadata.confidence.breakdown.dates * 100).toFixed(0) }}%
          </span>
        </div>
        <div v-if="metadata.confidence.breakdown.parties" class="confidence-item">
          <span class="confidence-label">Parties</span>
          <div class="confidence-bar">
            <div
              class="confidence-fill"
              :style="{ width: `${metadata.confidence.breakdown.parties * 100}%` }"
            />
          </div>
          <span class="confidence-value">
            {{ (metadata.confidence.breakdown.parties * 100).toFixed(0) }}%
          </span>
        </div>
      </div>

      <!-- Confidence Warnings -->
      <div v-if="metadata.confidence.warnings.length > 0" class="confidence-warnings">
        <div class="warnings-header">
          <ion-icon :icon="warningOutline" />
          <span>Quality Warnings</span>
        </div>
        <ul class="warnings-list">
          <li v-for="(warning, index) in metadata.confidence.warnings" :key="index">
            {{ warning }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { IonIcon, IonBadge } from '@ionic/vue';
import {
  documentTextOutline,
  folderOutline,
  listOutline,
  createOutline,
  calendarOutline,
  peopleOutline,
  analyticsOutline,
  warningOutline,
  locationOutline,
  businessOutline,
} from 'ionicons/icons';
import type { LegalDocumentMetadata, ExtractedParty } from '../legalDepartmentTypes';

const props = defineProps<{
  metadata: LegalDocumentMetadata;
}>();

function formatDocumentType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatSectionType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatPartyType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatPartyRole(role: string): string {
  return role
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDateType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'success';
  if (confidence >= 0.6) return 'warning';
  return 'danger';
}

function getStructureColor(structureType: string): string {
  switch (structureType) {
    case 'formal':
      return 'success';
    case 'informal':
      return 'warning';
    case 'mixed':
      return 'tertiary';
    case 'unstructured':
      return 'medium';
    default:
      return 'medium';
  }
}

function isContractingParty(party: ExtractedParty): boolean {
  if (!props.metadata.parties.contractingParties) return false;
  return props.metadata.parties.contractingParties.some((cp) => cp.name === party.name);
}
</script>

<style scoped>
.document-metadata-display {
  background: var(--ion-card-background, var(--ion-background-color));
  padding: 20px;
  border-radius: 8px;
  border: 1px solid var(--ion-color-light-shade);
}

.metadata-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--ion-color-medium-tint);
}

.metadata-header ion-icon {
  font-size: 28px;
  color: var(--ion-color-primary);
}

.metadata-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  flex: 1;
}

.metadata-section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.section-title ion-icon {
  font-size: 20px;
  color: var(--ion-color-primary);
}

.section-title h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  flex: 1;
}

.empty-state {
  padding: 16px;
  text-align: center;
  color: var(--ion-color-medium);
  font-style: italic;
}

/* Document Type */
.document-type-card {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 16px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
  border-left: 4px solid var(--ion-color-primary);
}

.type-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.confidence-text {
  font-size: 13px;
  color: var(--ion-color-medium);
}

.type-reasoning {
  margin: 8px 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--ion-color-dark);
}

.alternatives {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--ion-color-light-shade);
}

.alternatives-label {
  font-size: 13px;
  color: var(--ion-color-medium);
  font-weight: 500;
}

.alternative-badge {
  font-size: 11px;
}

/* Sections */
.sections-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-item {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
  border-left: 3px solid var(--ion-color-secondary);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title-text {
  flex: 1;
  font-weight: 500;
}

.section-confidence {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.clauses-list {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--ion-color-light-shade);
}

.clauses-label {
  font-size: 12px;
  color: var(--ion-color-medium);
}

/* Signatures */
.signatures-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.signature-item {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
  border-left: 3px solid var(--ion-color-tertiary);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.signature-content {
  flex: 1;
}

.signature-field {
  font-size: 14px;
  margin-bottom: 4px;
}

.signature-field strong {
  color: var(--ion-color-medium);
  font-weight: 500;
  margin-right: 6px;
}

.signature-confidence {
  font-size: 12px;
  color: var(--ion-color-medium);
  white-space: nowrap;
}

/* Dates */
.dates-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.date-item {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
  border-left: 3px solid var(--ion-color-medium);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.date-item.primary-date {
  border-left-color: var(--ion-color-primary);
  background: rgba(var(--ion-color-primary-rgb), 0.12);
}

.date-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.date-value {
  font-weight: 500;
}

.date-original {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.date-confidence {
  font-size: 12px;
  color: var(--ion-color-medium);
  white-space: nowrap;
}

/* Parties */
.parties-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.party-item {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
  border-left: 3px solid var(--ion-color-medium);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.party-item.contracting-party {
  border-left-color: var(--ion-color-success);
  background: rgba(var(--ion-color-success-rgb), 0.12);
}

.party-content {
  flex: 1;
}

.party-name {
  font-weight: 500;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.contracting-badge {
  font-size: 11px;
}

.party-details {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.party-role {
  font-size: 13px;
  color: var(--ion-color-medium);
}

.party-identifiers {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--ion-color-light-shade);
}

.identifier-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ion-color-dark);
  margin-bottom: 4px;
}

.identifier-item ion-icon {
  font-size: 14px;
  color: var(--ion-color-medium);
}

.party-confidence {
  font-size: 12px;
  color: var(--ion-color-medium);
  white-space: nowrap;
}

/* Confidence Breakdown */
.confidence-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confidence-item {
  display: grid;
  grid-template-columns: 120px 1fr auto;
  gap: 12px;
  align-items: center;
}

.confidence-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--ion-color-dark);
}

.confidence-bar {
  height: 8px;
  background: var(--ion-color-light-shade);
  border-radius: 4px;
  overflow: hidden;
}

.confidence-fill {
  height: 100%;
  background: linear-gradient(to right, var(--ion-color-success), var(--ion-color-primary));
  transition: width 0.3s ease;
}

.confidence-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--ion-color-dark);
  min-width: 40px;
  text-align: right;
}

.confidence-warnings {
  margin-top: 16px;
  padding: 12px;
  background: rgba(var(--ion-color-warning-rgb), 0.12);
  border-radius: 6px;
  border-left: 3px solid var(--ion-color-warning);
}

.warnings-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--ion-color-warning-shade);
}

.warnings-header ion-icon {
  font-size: 18px;
}

.warnings-list {
  margin: 0;
  padding-left: 20px;
}

.warnings-list li {
  font-size: 13px;
  color: var(--ion-color-dark);
  margin-bottom: 4px;
}
</style>
