<script setup lang="ts">
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import PeopleList from '@/components/people/PeopleList.vue'

/**
 * The people who teach.
 *
 * Teachers are not created here. They arrive by applying and being approved,
 * which leaves a record of who decided and why — a teacher conjured out of a
 * form has no such record.
 */
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Teachers" />
    <PeopleList
      group="teachers"
      title="teachers"
      subtitle="Approved through a teacher application. They see their own courses here."
      :role-options="['teacher']"
    />
  </admin-layout>
</template>
