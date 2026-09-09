import type { RouteRecordRaw } from 'vue-router'
import { SIN_GERENCIA } from '@/app/navigation'
import { ACTION_ROLES } from '@/modules/auth/permissions'
import type { Role } from '@/modules/auth/types'

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
    /**
     * Quién puede ABRIR la pantalla. Sin esto, esconder una entrada del menú no
     * servía de nada: bastaba con teclear la URL.
     *
     * Sale de la MISMA constante que el menú —`SIN_GERENCIA`— para que no haya
     * dos ideas distintas de a dónde puede ir alguien. Sigue sin ser control de
     * acceso: los datos los protegen el servidor y RLS. Esto evita que alguien
     * acabe en una pantalla que no le sirve y que además hace llamadas que le
     * van a responder 403.
     */
    roles?: readonly Role[]
  }
}

/** Marcador de posición. Si queda alguno, es que falta una pantalla. */
const pending = () => import('@/app/views/PendingView.vue')

export const routes: RouteRecordRaw[] = [
  /*
   * LA PANTALLA DEL TELÉFONO VA FUERA DE TODO ARMAZÓN.
   *
   * Quien la abre escaneó un papel pegado en una puerta: no tiene cuenta, no
   * tiene menú que abrir y no debería ver ninguno. Colgarla del layout de la
   * aplicación le enseñaría a un operario una barra lateral con trece pantallas
   * a las que no puede entrar.
   */
  {
    path: '/checar/:entityId/:installationId',
    name: 'phone-check-in',
    meta: { public: true, title: 'Checar sin reloj' },
    component: () => import('@/modules/org/views/PhoneCheckInView.vue'),
  },
  /*
   * CHECAR A DISTANCIA. Pública y sin armazón, igual que el cartel.
   *
   * Solo lleva la EMPRESA en la ruta, no una instalación: quien trabaja desde
   * casa no está en ninguna, y su base sale de su adscripción, no del enlace.
   */
  {
    path: '/remoto/:entityId',
    name: 'remote-check-in',
    meta: { public: true, title: 'Checar a distancia' },
    component: () => import('@/modules/remoto/views/RemoteCheckInView.vue'),
  },
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
        meta: { roles: SIN_GERENCIA, title: 'Organización' },
        component: () => import('@/modules/org/views/OrganizationView.vue'),
      },
      {
        path: 'cargar',
        name: 'imports',
        meta: { roles: ACTION_ROLES.bulkImport, title: 'Cargar desde Excel' },
        component: () => import('@/modules/imports/views/ImportsView.vue'),
      },
      {
        path: 'correos',
        name: 'outbox',
        meta: { roles: ACTION_ROLES.viewOutbox, title: 'Correos que manda Astra' },
        component: () => import('@/modules/outbox/views/OutboxView.vue'),
      },
      {
        path: 'usuarios',
        name: 'users',
        meta: { roles: ACTION_ROLES.manageUsers, title: 'Quién entra a Astra' },
        component: () => import('@/modules/users/views/UsersView.vue'),
      },
      {
        path: 'organizacion/departamentos',
        name: 'departments',
        meta: { roles: SIN_GERENCIA, title: 'Departamentos', acceptsLegalEntityFilter: true },
        component: () => import('@/modules/org/views/DepartmentsView.vue'),
      },
      {
        path: 'organizacion/puestos',
        name: 'positions',
        meta: { roles: SIN_GERENCIA, title: 'Puestos', acceptsLegalEntityFilter: true },
        component: () => import('@/modules/org/views/PositionsView.vue'),
      },
      {
        path: 'plantilla',
        name: 'employees',
        meta: { roles: SIN_GERENCIA, title: 'Plantilla', acceptsLegalEntityFilter: true },
        component: () => import('@/modules/employees/views/EmployeesView.vue'),
      },
      {
        path: 'plantilla/:employeeId',
        name: 'employee-detail',
        meta: { roles: SIN_GERENCIA, title: 'Expediente' },
        component: () => import('@/modules/employees/views/EmployeeDetailView.vue'),
      },
      {
        path: 'personal/ausencias',
        name: 'absences',
        meta: { roles: SIN_GERENCIA, title: 'Vacaciones y permisos' },
        component: () => import('@/modules/employees/views/AbsencesView.vue'),
      },
      {
        path: 'personal/festivos',
        name: 'holidays',
        meta: { roles: SIN_GERENCIA, title: 'Días festivos' },
        component: () => import('@/modules/employees/views/HolidaysView.vue'),
      },
      {
        path: 'relojes',
        name: 'devices',
        meta: { roles: SIN_GERENCIA, title: 'Relojes' },
        component: () => import('@/modules/devices/views/DevicesView.vue'),
      },
      {
        path: 'relojes/:deviceId/conciliacion',
        name: 'reconcile',
        meta: { roles: SIN_GERENCIA, title: 'Conciliar padrón' },
        component: () => import('@/modules/reconciliation/views/ReconcileView.vue'),
      },
      {
        path: 'relojes/:deviceId/padron',
        name: 'padron',
        meta: { roles: SIN_GERENCIA, title: 'Padrón del reloj' },
        component: () => import('@/modules/padron/views/PadronView.vue'),
      },
      {
        path: 'turnos',
        name: 'shifts',
        meta: { roles: SIN_GERENCIA, title: 'Turnos' },
        component: () => import('@/modules/shifts/views/ShiftsView.vue'),
      },
      {
        path: 'asistencia',
        name: 'attendance',
        meta: { roles: SIN_GERENCIA, title: 'Asistencia' },
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
        meta: { roles: SIN_GERENCIA, title: 'Marcajes' },
        component: () => import('@/modules/attendance/views/PunchesView.vue'),
      },
      {
        path: 'marcajes-sin-dueno',
        name: 'unmatched-punches',
        meta: { roles: SIN_GERENCIA, title: 'Marcajes sin dueño' },
        component: () => import('@/modules/punches/views/UnmatchedPunchesView.vue'),
      },
      {
        path: 'salud',
        name: 'device-health',
        meta: { roles: SIN_GERENCIA, title: 'Salud de relojes' },
        component: () => import('@/modules/health/views/DeviceHealthView.vue'),
      },
      {
        path: 'agentes',
        name: 'agents',
        meta: { roles: SIN_GERENCIA, title: 'Agentes de sitio' },
        component: () => import('@/modules/agents/views/AgentsView.vue'),
      },
    ],
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: pending },
]
