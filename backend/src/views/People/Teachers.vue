<script setup lang="ts">
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import PeopleList from '@/components/people/PeopleList.vue'

/**
 * The people who teach.
 *
 * Two ways in: approving a teacher application, which leaves a record of who
 * decided and why, or adding one here when the decision happened somewhere
 * else — someone hired directly, or moved over from another system.
 *
 * Creating one lands on their profile, because a teacher with no display name,
 * photo or subject cannot be put on a course anyone would click.
 */
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Teachers" />
    <PeopleList
      group="teachers"
      title="teachers"
      subtitle="Approved through an application, or added here when the decision was made elsewhere."
      :role-options="['teacher']"
      :create-roles="['teacher']"
      create-label="Add a teacher"
      allow-create
      profile-after-create
    />
  </admin-layout>
</template>
