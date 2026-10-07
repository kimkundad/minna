<script setup lang="ts">
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import PeopleList from '@/components/people/PeopleList.vue'

/**
 * Who runs the place.
 *
 * The only screen that creates an account, and a superadmin's alone: creating
 * staff and granting roles are the two powers that could be turned on the
 * people who hold them.
 */
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Administrators" />
    <PeopleList
      group="admins"
      title="administrators"
      subtitle="Who can run the site. Only a superadmin can add or change them."
      :role-options="['superadmin', 'admin']"
      :create-roles="['admin']"
      create-label="Add an administrator"
      allow-create
    />
  </admin-layout>
</template>
