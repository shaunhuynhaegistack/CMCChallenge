/**
 * The application's structural selectors, in one place.
 *
 * OrangeHRM is built on its own component library, whose class names (`oxd-*`)
 * are the only stable hook some widgets expose - there is no test id anywhere in
 * the product. Two rules keep that from becoming a maintenance problem:
 *
 *   1. Anything a user can name - a button, a field, a menu item - is addressed
 *      by that name in the page object (`getByRole`, or a field looked up by its
 *      label). Those survive a restyle, and they read like the interface.
 *   2. Everything else is addressed by the component class, and every one of
 *      those classes is listed here. When the design system moves, this file is
 *      the diff, not fifteen page objects.
 */
const selectors = {
  // Shell
  sidePanel: '.oxd-sidepanel',
  menuItem: '.oxd-main-menu-item',
  menuItemLabel: '.oxd-main-menu-item span',
  breadcrumbModule: '.oxd-topbar-header-breadcrumb-module',
  breadcrumbLevel: '.oxd-topbar-header-breadcrumb-level',
  userDropdownTab: '.oxd-userdropdown-tab',
  userDropdownName: '.oxd-userdropdown-name',

  // Forms
  inputGroup: '.oxd-input-group',
  fieldError: '.oxd-input-field-error-message',
  alertText: '.oxd-alert-content-text',
  radioWrapper: '.oxd-radio-wrapper',
  autocompleteOption: '.oxd-autocomplete-option',
  selectText: '.oxd-select-text',
  selectOption: '.oxd-select-option',
  formActions: '.oxd-form-actions',
  checkbox: '.oxd-checkbox-input',

  // Feedback
  toast: '.oxd-toast',
  spinner: '.oxd-loading-spinner',
  dialog: '.oxd-dialog-sheet',

  // Tables
  tableRow: '.oxd-table-card',
  tableHeader: '.oxd-table-header',
  rowActionButton: '.oxd-icon-button',
  recordCount: '.orangehrm-horizontal-padding span',

  // Screens
  loginBranding: '.orangehrm-login-branding img',
  forgotPasswordLink: '.orangehrm-login-forgot-header',
  dashboardWidget: '.oxd-grid-item.orangehrm-dashboard-widget',
  dashboardWidgetName: '.orangehrm-dashboard-widget-name'
} as const;

export default selectors;
