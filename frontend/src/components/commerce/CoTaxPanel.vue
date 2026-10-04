<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CoField from './CoField.vue'
import type { CheckoutErrors, CheckoutForm } from './types'

/**
 * The full tax-invoice details, shown only once someone asks for one.
 *
 * Thailand issues these to a company or to a person, and the two need
 * different identifiers — a thirteen-digit tax ID and a branch code, or a
 * thirteen-digit national ID. The segmented control switches between them
 * rather than showing both, so nobody fills in fields that will be thrown away.
 *
 * A head office is branch `00000` by law, so that case is a read-only field
 * stating the code rather than a question. Only an actual branch is asked to
 * type one.
 */
defineProps<{ form: CheckoutForm; errors: CheckoutErrors }>()

const { t } = useI18n()
</script>

<template>
  <div class="co-tax-panel">
    <fieldset class="fieldset">
      <legend>
        {{ t('commerce.tax.issueTo') }} <span class="req" aria-hidden="true">*</span>
      </legend>
      <div class="seg">
        <label>
          <input type="radio" name="taxType" value="corporate" v-model="form.taxType" />
          <span><AppIcon name="building" />{{ t('commerce.tax.corporate') }}</span>
        </label>
        <label>
          <input type="radio" name="taxType" value="individual" v-model="form.taxType" />
          <span><AppIcon name="user" />{{ t('commerce.tax.individual') }}</span>
        </label>
      </div>
    </fieldset>

    <div class="co-tax-fields" id="co-tax-fields">
      <!-- A person -->
      <div v-if="form.taxType === 'individual'" class="form-grid">
        <CoField
          id="tx-fn"
          name="taxFirstName"
          :label="t('commerce.tax.firstName')"
          required
          autocomplete="given-name"
          v-model="form.taxFirstName"
          :error="errors.taxFirstName"
        />
        <CoField
          id="tx-ln"
          name="taxLastName"
          :label="t('commerce.tax.lastName')"
          required
          autocomplete="family-name"
          v-model="form.taxLastName"
          :error="errors.taxLastName"
        />
        <CoField
          id="tx-idc"
          name="idCard"
          :label="t('commerce.tax.idCard')"
          required
          inputmode="numeric"
          :max="13"
          autocomplete="off"
          :placeholder="t('commerce.tax.digitsPlaceholder')"
          :help="t('commerce.tax.digitsHelp')"
          span
          v-model="form.idCard"
          :error="errors.idCard"
        />
        <CoField
          id="tx-addr"
          name="address"
          :label="t('commerce.tax.address')"
          required
          textarea
          autocomplete="street-address"
          :placeholder="t('commerce.tax.addressPlaceholder')"
          span
          v-model="form.address"
          :error="errors.address"
        />
      </div>

      <!-- A company -->
      <div v-else class="form-grid">
        <CoField
          id="tx-co"
          name="company"
          :label="t('commerce.tax.company')"
          required
          autocomplete="organization"
          :placeholder="t('commerce.tax.companyPlaceholder')"
          span
          v-model="form.company"
          :error="errors.company"
        />
        <CoField
          id="tx-tid"
          name="taxId"
          :label="t('commerce.tax.taxId')"
          required
          inputmode="numeric"
          :max="13"
          autocomplete="off"
          :placeholder="t('commerce.tax.digitsPlaceholder')"
          :help="t('commerce.tax.digitsHelp')"
          span
          v-model="form.taxId"
          :error="errors.taxId"
        />

        <div class="span-2">
          <fieldset class="fieldset">
            <legend>
              {{ t('commerce.tax.premisesType') }} <span class="req" aria-hidden="true">*</span>
            </legend>
            <div class="co-branch-opts">
              <label class="radio">
                <input type="radio" name="branchType" value="head" v-model="form.branchType" />
                <span>{{ t('commerce.tax.headOffice') }}</span>
              </label>
              <label class="radio">
                <input type="radio" name="branchType" value="branch" v-model="form.branchType" />
                <span>{{ t('commerce.tax.branch') }}</span>
              </label>
            </div>
          </fieldset>
        </div>

        <div class="span-2" id="co-branch-slot">
          <div v-if="form.branchType === 'branch'" class="form-grid">
            <CoField
              id="tx-br"
              name="branchNo"
              :label="t('commerce.tax.branchNo')"
              required
              inputmode="numeric"
              :max="5"
              autocomplete="off"
              :placeholder="t('commerce.tax.branchNoPlaceholder')"
              :help="t('commerce.tax.branchNoHelp')"
              v-model="form.branchNo"
              :error="errors.branchNo"
            />
          </div>
          <div v-else class="field">
            <label class="label" for="tx-br-ro">{{ t('commerce.tax.branchCode') }}</label>
            <div class="co-branch-code">
              <input class="input" id="tx-br-ro" value="00000" readonly aria-describedby="tx-br-ro-h" />
            </div>
            <span class="field-help" id="tx-br-ro-h">{{ t('commerce.tax.headOfficeCode') }}</span>
          </div>
        </div>

        <CoField
          id="tx-addr"
          name="address"
          :label="t('commerce.tax.address')"
          required
          textarea
          autocomplete="street-address"
          :placeholder="t('commerce.tax.addressPlaceholder')"
          span
          v-model="form.address"
          :error="errors.address"
        />
      </div>
    </div>
  </div>
</template>
