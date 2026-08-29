import type { RouteRecordRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** Alcanzable sin sesión (hoy solo la pantalla de entrar). */
    public?: boolean
    title?: string
    /**
     * La pantalla lee `?legalEntityId=` de la URL, así que el selector de la
     * barra superior escribe ahí en vez de solo recordarlo.
     */
    acceptsLegalEntityFilter?: boolean
  }
}

/** Marcador de posición. Si queda alguno, es que falta una pantalla. */
const pending = () => import('@/app/views/PendingView.vue')

export const routes: RouteRecordRaw[] = [
  {
    path: '/entrar',
    component: () => import('@/app/layouts/AuthLayout.vue'),
    children: [
      {
        path: '',
        name: 'login',
        meta: { public: true, title: 'Entrar' },
        component: () => import('@/modules/auth/views/LoginView.vue'),
      },
    ],
  },
  {
    path: '/',
    component: () => import('@/app/layouts/AppLayout.vue'),
    children: [
      { path: '', redirect: { name: 'organization' } },
      {
        path: 'organizacion',
        name: 'organization',
        meta: { title: 'Organización' },
        component: () => import('@/modules/org/views/OrganizationView.vue'),
      },
      {
        path: 'organizacion/departamentos',
        name: 'departments',
        meta: { title: 'Departamentos', acceptsLegalEntityFilter: true },
        component: () => import('@/modules/org/views/DepartmentsView.vue'),
      },
      {
        path: 'organizacion/puestos',
        name: 'positions',
        meta: { title: 'Puestos', acceptsLegalEntityFilter: true },
        component: () => import('@/modules/org/views/PositionsView.vue'),
      },
      {
        path: 'plantilla',
        name: 'employees',
        meta: { title: 'Plantilla', acceptsLegalEntityFilter: true },
        component: () => import('@/modules/employees/views/EmployeesView.vue'),
      },
      {
        path: 'plantilla/:employeeId',
        name: 'employee-detail',
        meta: { title: 'Expediente' },
        component: () => import('@/modules/employees/views/EmployeeDetailView.vue'),
      },
      {
        path: 'personal/ausencias',
        name: 'absences',
        meta: { title: 'Vacaciones y permisos' },
        component: () => import('@/modules/employees/views/AbsencesView.vue'),
      },
      {
        path: 'personal/festivos',
        name: 'holidays',
        meta: { title: 'Días festivos' },
        component: () => import('@/modules/employees/views/HolidaysView.vue'),
      },
      {
        path: 'relojes',
        name: 'devices',
        meta: { title: 'Relojes' },
        component: () => import('@/modules/devices/views/DevicesView.vue'),
      },
      {
        path: 'relojes/:deviceId/conciliacion',
        name: 'reconcile',
        meta: { title: 'Conciliar padrón' },
        component: () => import('@/modules/reconciliation/views/ReconcileView.vue'),
      },
      {
        path: 'relojes/:deviceId/padron',
        name: 'padron',
        meta: { title: 'Padrón del reloj' },
        component: () => import('@/modules/padron/views/PadronView.vue'),
      },
      {
        path: 'turnos',
        name: 'shifts',
        meta: { title: 'Turnos' },
        component: () => import('@/modules/shifts/views/ShiftsView.vue'),
      },
      {
        path: 'asistencia',
        name: 'attendance',
        meta: { title: 'Asistencia' },
        component: () => import('@/modules/attendance/views/AttendanceView.vue'),
      },
      {
        path: 'tiempo-extra',
        name: 'overtime',
        meta: { title: 'Permisos de tiempo extra' },
        component: () => import('@/modules/attendance/views/OvertimeView.vue'),
      },
      {
        path: 'marcajes',
        name: 'punches',
        meta: { title: 'Marcajes' },
        component: () => import('@/modules/attendance/views/PunchesView.vue'),
      },
      {
        path: 'marcajes-sin-dueno',
        name: 'unmatched-punches',
        meta: { title: 'Marcajes sin dueño' },
        component: () => import('@/modules/punches/views/UnmatchedPunchesView.vue'),
      },
      {
        path: 'salud',
        name: 'device-health',
        meta: { title: 'Salud de relojes' },
        component: () => import('@/modules/health/views/DeviceHealthView.vue'),
      },
      {
        path: 'agentes',
        name: 'agents',
        meta: { title: 'Agentes de sitio' },
        component: () => import('@/modules/agents/views/AgentsView.vue'),
      },
    ],
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: pending },
]
