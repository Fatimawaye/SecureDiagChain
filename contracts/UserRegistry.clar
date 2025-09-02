;; UserRegistry.clar
;; Sophisticated user registry for SecureDiagChain
;; Handles registration, verification, profiles, ratings, roles, permissions, bans, and more

(define-constant ERR-UNAUTHORIZED (err u100))
(define-constant ERR-ALREADY-REGISTERED (err u101))
(define-constant ERR-INVALID-ROLE (err u102))
(define-constant ERR-NOT-VERIFIED (err u103))
(define-constant ERR-BANNED (err u104))
(define-constant ERR-INVALID-RATING (err u105))
(define-constant ERR-INVALID-PERMISSION (err u106))
(define-constant ERR-ALREADY-BANNED (err u107))
(define-constant ERR-NOT-BANNED (err u108))
(define-constant ERR-INVALID-DETAILS (err u109))
(define-constant MAX-NAME-LEN u50)
(define-constant MAX-BIO-LEN u500)
(define-constant MAX-SPECIALTY-LEN u64)
(define-constant MAX-CERT-LEN u200)
(define-constant MAX-PERMS u5)

(define-map users principal 
  {
    role: (string-ascii 32),
    verified: bool,
    banned: bool,
    name: (string-utf8 50),
    bio: (string-utf8 500),
    registration-time: uint
  }
)

(define-map experts principal 
  {
    specialty: (string-ascii 64),
    rating-sum: uint,
    rating-count: uint,
    certifications: (list 10 (string-utf8 200))
  }
)

(define-map user-permissions 
  { user: principal, permission: (string-ascii 32) } 
  bool
)

(define-map bans principal 
  {
    reason: (string-utf8 200),
    ban-time: uint,
    banned-by: principal
  }
)

(define-data-var admin principal tx-sender)
(define-data-var verifier principal tx-sender)

(define-public (set-admin (new-admin principal))
  (if (is-eq tx-sender (var-get admin))
    (begin
      (var-set admin new-admin)
      (ok true))
    ERR-UNAUTHORIZED))

(define-public (set-verifier (new-verifier principal))
  (if (is-eq tx-sender (var-get admin))
    (begin
      (var-set verifier new-verifier)
      (ok true))
    ERR-UNAUTHORIZED))

(define-public (register-user (role (string-ascii 32)) (name (string-utf8 50)) (bio (string-utf8 500)))
  (let ((caller tx-sender))
    (asserts! (or (is-eq role "patient") (is-eq role "client")) ERR-INVALID-ROLE)
    (asserts! (is-none (map-get? users caller)) ERR-ALREADY-REGISTERED)
    (asserts! (<= (len name) MAX-NAME-LEN) ERR-INVALID-DETAILS)
    (asserts! (<= (len bio) MAX-BIO-LEN) ERR-INVALID-DETAILS)
    (map-set users caller 
      {
        role: role,
        verified: false,
        banned: false,
        name: name,
        bio: bio,
        registration-time: (block-height)
      })
    (ok true)))

(define-public (register-expert (specialty (string-ascii 64)) (name (string-utf8 50)) (bio (string-utf8 500)) (certs (list 10 (string-utf8 200))))
  (let ((caller tx-sender))
    (asserts! (is-none (map-get? users caller)) ERR-ALREADY-REGISTERED)
    (asserts! (<= (len specialty) MAX-SPECIALTY-LEN) ERR-INVALID-DETAILS)
    (asserts! (<= (len name) MAX-NAME-LEN) ERR-INVALID-DETAILS)
    (asserts! (<= (len bio) MAX-BIO-LEN) ERR-INVALID-DETAILS)
    (map-set users caller 
      {
        role: "expert",
        verified: false,
        banned: false,
        name: name,
        bio: bio,
        registration-time: (block-height)
      })
    (map-set experts caller 
      {
        specialty: specialty,
        rating-sum: u0,
        rating-count: u0,
        certifications: certs
      })
    (ok true)))

(define-public (verify-user (user principal))
  (let ((caller tx-sender)
        (user-data (map-get? users user)))
    (asserts! (is-eq caller (var-get verifier)) ERR-UNAUTHORIZED)
    (asserts! (is-some user-data) ERR-INVALID-ROLE)
    (asserts! (not (get verified (unwrap-panic user-data))) ERR-ALREADY-REGISTERED)
    (map-set users user (merge (unwrap-panic user-data) { verified: true }))
    (ok true)))

(define-public (update-profile (name (string-utf8 50)) (bio (string-utf8 500)))
  (let ((caller tx-sender)
        (user-data (unwrap! (map-get? users caller) ERR-UNAUTHORIZED)))
    (asserts! (not (get banned user-data)) ERR-BANNED)
    (asserts! (<= (len name) MAX-NAME-LEN) ERR-INVALID-DETAILS)
    (asserts! (<= (len bio) MAX-BIO-LEN) ERR-INVALID-DETAILS)
    (map-set users caller (merge user-data { name: name, bio: bio }))
    (ok true)))

(define-public (update-expert-details (specialty (string-ascii 64)) (certs (list 10 (string-utf8 200))))
  (let ((caller tx-sender)
        (user-data (unwrap! (map-get? users caller) ERR-UNAUTHORIZED))
        (expert-data (unwrap! (map-get? experts caller) ERR-INVALID-ROLE)))
    (asserts! (is-eq (get role user-data) "expert") ERR-INVALID-ROLE)
    (asserts! (not (get banned user-data)) ERR-BANNED)
    (asserts! (<= (len specialty) MAX-SPECIALTY-LEN) ERR-INVALID-DETAILS)
    (map-set experts caller (merge expert-data { specialty: specialty, certifications: certs }))
    (ok true)))

(define-public (add-rating (expert principal) (rating uint))
  (let ((caller tx-sender)
        (expert-data (unwrap! (map-get? experts expert) ERR-INVALID-ROLE))
        (user-data (unwrap! (map-get? users caller) ERR-UNAUTHORIZED)))
    (asserts! (get verified user-data) ERR-NOT-VERIFIED)
    (asserts! (and (>= rating u1) (<= rating u5)) ERR-INVALID-RATING)
    (map-set experts expert 
      {
        specialty: (get specialty expert-data),
        rating-sum: (+ (get rating-sum expert-data) rating),
        rating-count: (+ (get rating-count expert-data) u1),
        certifications: (get certifications expert-data)
      })
    (ok true)))

(define-public (grant-permission (user principal) (permission (string-ascii 32)))
  (let ((caller tx-sender))
    (asserts! (is-eq caller (var-get admin)) ERR-UNAUTHORIZED)
    (map-set user-permissions { user: user, permission: permission } true)
    (ok true)))

(define-public (revoke-permission (user principal) (permission (string-ascii 32)))
  (let ((caller tx-sender))
    (asserts! (is-eq caller (var-get admin)) ERR-UNAUTHORIZED)
    (map-delete user-permissions { user: user, permission: permission })
    (ok true)))

(define-public (ban-user (user principal) (reason (string-utf8 200)))
  (let ((caller tx-sender)
        (user-data (unwrap! (map-get? users user) ERR-INVALID-ROLE)))
    (asserts! (is-eq caller (var-get admin)) ERR-UNAUTHORIZED)
    (asserts! (not (get banned user-data)) ERR-ALREADY-BANNED)
    (map-set users user (merge user-data { banned: true }))
    (map-set bans user 
      {
        reason: reason,
        ban-time: (block-height),
        banned-by: caller
      })
    (ok true)))

(define-public (unban-user (user principal))
  (let ((caller tx-sender)
        (user-data (unwrap! (map-get? users user) ERR-INVALID-ROLE)))
    (asserts! (is-eq caller (var-get admin)) ERR-UNAUTHORIZED)
    (asserts! (get banned user-data) ERR-NOT-BANNED)
    (map-set users user (merge user-data { banned: false }))
    (map-delete bans user)
    (ok true)))

(define-read-only (get-user-details (user principal))
  (map-get? users user))

(define-read-only (get-expert-details (expert principal))
  (map-get? experts expert))

(define-read-only (get-average-rating (expert principal))
  (let ((expert-data (map-get? experts expert)))
    (if (is-some expert-data)
      (let ((data (unwrap-panic expert-data)))
        (if (> (get rating-count data) u0)
          (ok (/ (get rating-sum data) (get rating-count data)))
          (ok u0)))
      ERR-INVALID-ROLE)))

(define-read-only (has-permission (user principal) (permission (string-ascii 32)))
  (default-to false (map-get? user-permissions { user: user, permission: permission })))

(define-read-only (get-ban-details (user principal))
  (map-get? bans user))

(define-read-only (is-verified (user principal))
  (let ((user-data (map-get? users user)))
    (if (is-some user-data)
      (get verified (unwrap-panic user-data))
      false)))

(define-read-only (is-banned (user principal))
  (let ((user-data (map-get? users user)))
    (if (is-some user-data)
      (get banned (unwrap-panic user-data))
      false)))

(define-read-only (get-user-role (user principal))
  (let ((user-data (map-get? users user)))
    (if (is-some user-data)
      (some (get role (unwrap-panic user-data)))
      none)))

(define-read-only (get-admin)
  (var-get admin))

(define-read-only (get-verifier)
  (var-get verifier))