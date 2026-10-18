# Beauchefdle 🎮

> ¡El famoso juego de adivinanzas del New York Times adaptado a los ramos y la vida universitaria de Beauchef (Universidad de Chile)!

![Estado del proyecto](https://img.shields.io/badge/estado-en%20desarrollo-success)

## 📋 Descripción

**Beauchefdle** es un juego web interactivo de trivia académica donde los usuarios deben adivinar un ramo secreto de Beauchef basándose en pistas de atributos (como departamento, créditos, carácter, requisitos, nivel, semestre y carreras). Cuenta con múltiples modos de juego, soporte para autenticación de usuarios mediante Supabase, sistema de puntajes por intentos y tablas de clasificación (*Leaderboards*) tanto diarias como globales.

---

## ✨ Características principales

* **Ramo del Día:** Un desafío diario sincronizado para todos los jugadores con persistencia de progreso.
* **Práctica Libre:** Modo de juego libre para practicar sin límites.
* **Blind Ranking:** Modo especial en el que debes organizar un ranking de ramos a ciegas de mejor a peor según van apareciendo.
* **Tier List - PC:** Tablero interactivo de arrastrar y soltar (drag & drop) o selección por clic para clasificar los ramos de Plan Común en categorías (S, A, B, C, D, F).
* **Filtros por Departamento y Plan Común:** Posibilidad de jugar y filtrar los retos por departamentos específicos o por el Plan Común.
* **Cuentas de Usuario y Leaderboards:** Sistema de registro y login seguro con contraseñas, perfiles con nombres de usuario únicos, persistencia de sesión automática y tabla de clasificación global de puntos (TOP 5 y acumulados).

---

## 🚀 Tecnologías utilizadas

* **Frontend:** HTML5, CSS3 (Diseño responsivo con variables y grillas), JavaScript (Módulos ES6).
* **Base de datos y Backend as a Service (BaaS):** [Supabase](https://supabase.com/) (Autenticación, políticas de seguridad RLS, triggers y funciones RPC).
* **Fuentes y tipografías:** Bricolage Grotesque & IBM Plex Mono (Google Fonts).
