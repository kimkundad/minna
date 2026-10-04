import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    return savedPosition || { left: 0, top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'Ecommerce',
      component: () => import('../views/Ecommerce.vue'),
      meta: {
        title: 'eCommerce Dashboard',
      },
    },
    {
      path: '/analytics',
      name: 'Analytics',
      component: () => import('../views/Analytics.vue'),
      meta: {
        title: 'Analytics Dashboard',
      },
    },
    {
      path: '/marketing',
      name: 'Marketing',
      component: () => import('../views/Marketing.vue'),
      meta: {
        title: 'Marketing Dashboard',
      },
    },
    {
      path: '/crm',
      name: 'Crm',
      component: () => import('../views/Crm.vue'),
      meta: {
        title: 'CRM Dashboard',
      },
    },
    {
      path: '/stocks',
      name: 'Stocks',
      component: () => import('../views/Stocks.vue'),
      meta: {
        title: 'Stocks Dashboard',
      },
    },
    {
      path: '/saas',
      name: 'SaaS',
      component: () => import('../views/Saas.vue'),
      meta: {
        title: 'SaaS Dashboard',
      },
    },
    {
      path: '/logistics',
      name: 'Logistics',
      component: () => import('../views/Logistics.vue'),
      meta: {
        title: 'Logistics Dashboard',
      },
    },
    {
      path: '/sales',
      name: 'Sales',
      component: () => import('../views/Sales.vue'),
      meta: {
        title: 'Sales Dashboard',
      },
    },
    {
      path: '/ai',
      name: 'AI',
      component: () => import('../views/AI.vue'),
      meta: {
        title: 'AI Dashboard',
      },
    },
    {
      path: '/finance',
      name: 'Finance',
      component: () => import('../views/Finance.vue'),
      meta: {
        title: 'Finance Dashboard',
      },
    },
    {
      path: '/text-generator',
      name: 'Text Generator',
      component: () => import('../views/Ai/TextGenerator.vue'),
      meta: {
        title: 'AI Text Generator',
      },
    },
    {
      path: '/code-generator',
      name: 'Code Generator',
      component: () => import('../views/Ai/CodeGenerator.vue'),
      meta: {
        title: 'AI Code Generator',
      },
    },
    {
      path: '/image-generator',
      name: 'Image Generator',
      component: () => import('../views/Ai/ImageGenerator.vue'),
      meta: {
        title: 'AI Image Generator',
      },
    },
    {
      path: '/video-generator',
      name: 'Video Generator',
      component: () => import('../views/Ai/VideoGenerator.vue'),
      meta: {
        title: 'AI Video Generator',
      },
    },
    {
      path: '/products-list',
      name: 'Products',
      component: () => import('../views/Ecommerce/Products.vue'),
      meta: {
        title: 'E-commerce Products',
      },
    },
    {
      path: '/add-product',
      name: 'Add Product',
      component: () => import('../views/Ecommerce/AddProduct.vue'),
      meta: {
        title: 'E-commerce Add Product',
      },
    },
    {
      path: '/billing',
      name: 'Billing',
      component: () => import('../views/Ecommerce/Billing.vue'),
      meta: {
        title: 'E-commerce Billing',
      },
    },
    {
      path: '/invoices',
      name: 'Invoices',
      component: () => import('../views/Ecommerce/Invoices.vue'),
      meta: {
        title: 'E-commerce Invoices',
      },
    },
    {
      path: '/single-invoice',
      name: 'Single Invoice',
      component: () => import('../views/Ecommerce/SingleInvoice.vue'),
      meta: {
        title: 'E-commerce Single Invoice',
      },
    },
    {
      path: '/create-invoice',
      name: 'Create Invoice',
      component: () => import('../views/Ecommerce/CreateInvoice.vue'),
      meta: {
        title: 'E-commerce Create Invoice',
      },
    },
    {
      path: '/transactions',
      name: 'Transactions',
      component: () => import('../views/Ecommerce/Transactions.vue'),
      meta: {
        title: 'E-commerce Transactions',
      },
    },
    {
      path: '/single-transaction',
      name: 'Single Transaction',
      component: () => import('../views/Ecommerce/SingleTransaction.vue'),
      meta: {
        title: 'E-commerce Single Transaction',
      },
    },
    {
      path: '/calendar',
      name: 'Calendar',
      component: () => import('../views/Others/Calendar.vue'),
      meta: {
        title: 'Calendar',
      },
    },
    {
      path: '/profile',
      name: 'Profile',
      component: () => import('../views/Others/UserProfile.vue'),
      meta: {
        title: 'Profile',
      },
    },
    {
      path: '/task-list',
      name: 'Task List',
      component: () => import('../views/Task/TaskList.vue'),
      meta: {
        title: 'Task List',
      },
    },
    {
      path: '/task-kanban',
      name: 'Task Kanban',
      component: () => import('../views/Task/TaskKanban.vue'),
      meta: {
        title: 'Task Kanban',
      },
    },
    {
      path: '/form-elements',
      name: 'Form Elements',
      component: () => import('../views/Forms/FormElements.vue'),
      meta: {
        title: 'Form Elements',
      },
    },
    {
      path: '/form-layout',
      name: 'Form Layout',
      component: () => import('../views/Forms/FormLayout.vue'),
      meta: {
        title: 'Form Layout',
      },
    },
    {
      path: '/basic-tables',
      name: 'Basic Tables',
      component: () => import('../views/Tables/BasicTables.vue'),
      meta: {
        title: 'Basic Tables',
      },
    },
    {
      path: '/data-tables',
      name: 'Data Tables',
      component: () => import('../views/Tables/DataTables.vue'),
      meta: {
        title: 'Data Tables',
      },
    },
    {
      path: '/chat',
      name: 'Chat',
      component: () => import('../views/Others/Chat.vue'),
      meta: {
        title: 'Chats',
      },
    },
    {
      path: '/support-tickets',
      name: 'Ticket List',
      component: () => import('../views/Support/SupportList.vue'),
      meta: {
        title: 'Ticket List',
      },
    },
    {
      path: '/support-ticket-reply',
      name: 'Ticket Reply',
      component: () => import('../views/Support/SupportReply.vue'),
      meta: {
        title: 'Ticket Reply',
      },
    },
    {
      path: '/inbox',
      name: 'Inbox',
      component: () => import('../views/Email/EmailInboxPage.vue'),
      meta: {
        title: 'Inbox',
      },
    },
    {
      path: '/inbox-details',
      name: 'Details',
      component: () => import('../views/Email/EmailDetailsPage.vue'),
      meta: {
        title: 'Inbox Details',
      },
    },
    {
      path: '/invoice',
      name: 'Invoice',
      component: () => import('../views/Others/Invoice.vue'),
      meta: {
        title: 'E-commerce Invoice',
      },
    },
    {
      path: '/line-chart',
      name: 'Line Chart',
      component: () => import('../views/Chart/LineChart/LineChart.vue'),
      meta: {
        title: 'Line Chart',
      },
    },
    {
      path: '/bar-chart',
      name: 'Bar Chart',
      component: () => import('../views/Chart/BarChart/BarChart.vue'),
      meta: {
        title: 'Bar Chart',
      },
    },
    {
      path: '/doughnut-chart',
      name: 'Doughnut Chart',
      component: () => import('../views/Chart/DoughnutChart/DoughnutChart.vue'),
      meta: {
        title: 'Doughnut Chart',
      },
    },
    {
      path: '/alerts',
      name: 'Alerts',
      component: () => import('../views/UiElements/Alerts.vue'),
      meta: {
        title: 'Alerts',
      },
    },
    {
      path: '/avatars',
      name: 'Avatars',
      component: () => import('../views/UiElements/Avatars.vue'),
      meta: {
        title: 'Avatars',
      },
    },
    {
      path: '/badge',
      name: 'Badge',
      component: () => import('../views/UiElements/Badges.vue'),
      meta: {
        title: 'Badge',
      },
    },
    {
      path: '/breadcrumb',
      name: 'Breadcrumb',
      component: () => import('../views/UiElements/Breadcrumbs.vue'),
      meta: {
        title: 'Breadcrumbs',
      },
    },
    {
      path: '/buttons',
      name: 'Buttons',
      component: () => import('../views/UiElements/Buttons.vue'),
      meta: {
        title: 'Buttons',
      },
    },
    {
      path: '/buttons-group',
      name: 'Buttons Group',
      component: () => import('../views/UiElements/ButtonsGroup.vue'),
      meta: {
        title: 'Buttons Group',
      },
    },
    {
      path: '/cards',
      name: 'Cards',
      component: () => import('../views/UiElements/Cards.vue'),
      meta: {
        title: 'Cards',
      },
    },
    {
      path: '/carousel',
      name: 'Carousel',
      component: () => import('../views/UiElements/Carousel.vue'),
      meta: {
        title: 'Carousel',
      },
    },
    {
      path: '/dropdowns',
      name: 'Dropdowns',
      component: () => import('../views/UiElements/Dropdowns.vue'),
      meta: {
        title: 'Dropdowns',
      },
    },
    {
      path: '/images',
      name: 'Images',
      component: () => import('../views/UiElements/Images.vue'),
      meta: {
        title: 'Images',
      },
    },
    {
      path: '/links',
      name: 'Links',
      component: () => import('../views/UiElements/Links.vue'),
      meta: {
        title: 'Links',
      },
    },
    {
      path: '/list',
      name: 'List',
      component: () => import('../views/UiElements/List.vue'),
      meta: {
        title: 'List',
      },
    },
    {
      path: '/modals',
      name: 'Modals',
      component: () => import('../views/UiElements/Modals.vue'),
      meta: {
        title: 'Modals',
      },
    },
    {
      path: '/notifications',
      name: 'Notifications',
      component: () => import('../views/UiElements/Notifications.vue'),
      meta: {
        title: 'Notifications',
      },
    },
    {
      path: '/pagination',
      name: 'Pagination',
      component: () => import('../views/UiElements/Pagination.vue'),
      meta: {
        title: 'Pagination',
      },
    },
    {
      path: '/popovers',
      name: 'Popovers',
      component: () => import('../views/UiElements/Popovers.vue'),
      meta: {
        title: 'Popovers',
      },
    },
    {
      path: '/progress-bar',
      name: 'Progressbar',
      component: () => import('../views/UiElements/Progressbar.vue'),
      meta: {
        title: 'Progressbar',
      },
    },
    {
      path: '/ribbons',
      name: 'Ribbons',
      component: () => import('../views/UiElements/Ribbons.vue'),
      meta: {
        title: 'Ribbon',
      },
    },
    {
      path: '/spinners',
      name: 'Spinners',
      component: () => import('../views/UiElements/Spinners.vue'),
      meta: {
        title: 'Spinners',
      },
    },
    {
      path: '/tabs',
      name: 'Tabs',
      component: () => import('../views/UiElements/Tabs.vue'),
      meta: {
        title: 'Tabs',
      },
    },
    {
      path: '/tooltips',
      name: 'Tooltips',
      component: () => import('../views/UiElements/Tooltips.vue'),
      meta: {
        title: 'Tooltip',
      },
    },
    {
      path: '/videos',
      name: 'Videos',
      component: () => import('../views/UiElements/Videos.vue'),
      meta: {
        title: 'Videos',
      },
    },
    {
      path: '/file-manager',
      name: 'File Manager',
      component: () => import('../views/Pages/FileManager.vue'),
      meta: {
        title: 'File Manager Page',
      },
    },
    {
      path: '/pricing-tables',
      name: 'Pricing Tables',
      component: () => import('../views/Pages/PricingTables.vue'),
      meta: {
        title: 'Pricing Tables Page',
      },
    },
    {
      path: '/faq',
      name: 'Faq',
      component: () => import('../views/Pages/Faq.vue'),
      meta: {
        title: 'FAQ Page',
      },
    },
    {
      path: '/api-keys',
      name: 'API Keys',
      component: () => import('../views/Pages/ApiKeys.vue'),
      meta: {
        title: 'API Keys Page',
      },
    },
    {
      path: '/integrations',
      name: 'Integrations',
      component: () => import('../views/Pages/Integrations.vue'),
      meta: {
        title: 'Integrations Page',
      },
    },
    {
      path: '/blank',
      name: 'Blank',
      component: () => import('../views/Pages/BlankPage.vue'),
      meta: {
        title: 'Blank Page',
      },
    },
    {
      path: '/success',
      name: 'Success',
      component: () => import('../views/Others/Success.vue'),
      meta: {
        title: 'Success Page',
      },
    },
    {
      path: '/error-404',
      name: '404 Error',
      component: () => import('../views/Errors/FourZeroFour.vue'),
      meta: {
        title: '404 Error Page',
      },
    },
    {
      path: '/error-503',
      name: '503 Error',
      component: () => import('../views/Errors/FiveZeroThree.vue'),
      meta: {
        title: '503 Error Page',
      },
    },
    {
      path: '/error-500',
      name: '500 Error',
      component: () => import('../views/Errors/FiveZeroZero.vue'),
      meta: {
        title: '500 Error Page',
      },
    },
    {
      path: '/:pathMatch(.*)*',
      component: () => import('../views/Errors/FourZeroFour.vue'),
      meta: {
        title: '500 Error Page',
      },
    },
    {
      path: '/maintenance',
      name: 'Maintenance',
      component: () => import('../views/Others/Maintenance.vue'),
      meta: {
        title: 'Maintenance Page',
      },
    },
    {
      path: '/coming-soon',
      name: 'Coming Soon',
      component: () => import('../views/Others/ComingSoon.vue'),
      meta: {
        title: 'Coming Soon Page',
      },
    },
    {
      path: '/signin',
      name: 'Signin',
      component: () => import('../views/Auth/Signin.vue'),
      meta: {
        title: 'Sign In',
      },
    },
    {
      path: '/signup',
      name: 'Signup',
      component: () => import('../views/Auth/Signup.vue'),
      meta: {
        title: 'Sign Up',
      },
    },
    {
      path: '/two-step-verification',
      name: 'Two Step Verification',
      component: () => import('../views/Auth/TwoStepVerification.vue'),
      meta: {
        title: 'Two Step Verification',
      },
    },
    {
      path: '/reset-password',
      name: 'Reset Password',
      component: () => import('../views/Auth/ResetPassword.vue'),
      meta: {
        title: 'Reset Password',
      },
    },
    {
      path: '/layout-one',
      name: 'Layout One',
      component: () => import('../views/Layouts/LayoutOne.vue'),
      meta: {
        title: 'Layout One',
      },
    },
    {
      path: '/layout-two',
      name: 'Layout Two',
      component: () => import('../views/Layouts/LayoutTwo.vue'),
      meta: {
        title: 'Layout Two',
      },
    },
    {
      path: '/layout-three',
      name: 'Layout Three',
      component: () => import('../views/Layouts/LayoutThree.vue'),
      meta: {
        title: 'Layout Three',
      },
    },
    {
      path: '/layout-four',
      name: 'Layout Four',
      component: () => import('../views/Layouts/LayoutFour.vue'),
      meta: {
        title: 'Layout Four',
      },
    },
    {
      path: '/layout-five',
      name: 'Layout Five',
      component: () => import('../views/Layouts/LayoutFive.vue'),
      meta: {
        title: 'Layout Five',
      },
    },
    {
      path: '/layout-six',
      name: 'Layout Six',
      component: () => import('../views/Layouts/LayoutSix.vue'),
      meta: {
        title: 'Layout 6',
      },
    },
  ],
})

export default router

router.beforeEach((to, from, next) => {
  document.title = `Vue.js ${to.meta.title} | TailAdmin - Vue.js Tailwind CSS Dashboard Template`
  next()
})
