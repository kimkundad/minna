<script setup lang="ts">
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import PeopleList from '@/components/people/PeopleList.vue'

/**
 * Everyone learning on the public site.
 *
 * No roles column: a student holds nothing worth editing here, and promoting
 * one happens through a teacher application, which keeps a record of why.
 */
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Students" />
    <PeopleList
      group="students"
      title="students"
      subtitle="Everyone learning on the site."
      :role-options="[]"
    />
  </admin-layout>
</template>
