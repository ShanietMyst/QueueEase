<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$configuredOrigin = getenv('QUEUEEASE_FRONTEND_ORIGIN') ?: 'http://localhost:5173';
$allowedOrigins = array_values(array_unique(array_filter([
    $configuredOrigin,
    'http://127.0.0.1:5173',
])));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$secureCookie = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
ini_set('session.use_strict_mode', '1');
session_name('queueease_session');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $secureCookie,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

function respond(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function body(): array
{
    $decoded = json_decode(file_get_contents('php://input') ?: '', true);
    return is_array($decoded) ? $decoded : [];
}

function inputString(array $input, string $key): string
{
    $value = $input[$key] ?? '';
    if (!is_string($value)) {
        respond(['error' => 'Invalid input format.'], 422);
    }
    return $value;
}

function requiredString(array $input, string $key, int $maxLength, string $label): string
{
    $value = trim(inputString($input, $key));
    if ($value === '' || mb_strlen($value) > $maxLength) {
        respond(['error' => "$label is required and must be no more than $maxLength characters."], 422);
    }
    return $value;
}

function user(): array
{
    if (!isset($_SESSION['account']) || !is_array($_SESSION['account'])) {
        respond(['error' => 'Please log in to continue.'], 401);
    }
    $account = $_SESSION['account'];
    if (!in_array($account['role'] ?? '', ['admin', 'user'], true)) {
        respond(['error' => 'Please log in to continue.'], 401);
    }
    $table = $account['_table'] ?? (($account['role'] ?? '') === 'admin' ? 'administrators' : 'users');
    if (!in_array($table, ['users', 'administrators'], true)) {
        respond(['error' => 'Please log in to continue.'], 401);
    }
    $roleCondition = $table === 'users' ? ' AND role = ?' : '';
    $statement = db()->prepare("SELECT is_active FROM $table WHERE id = ?$roleCondition");
    $parameters = [$account['id']];
    if ($roleCondition !== '') {
        $parameters[] = $account['role'];
    }
    $statement->execute($parameters);
    if (!(bool)$statement->fetchColumn()) {
        $_SESSION = [];
        session_destroy();
        respond(['error' => 'This account is inactive. Contact an administrator for help.'], 403);
    }
    return $account;
}

function publicAccount(array $account): array
{
    unset($account['_table']);
    return $account;
}

function passwordMatches(array $account, string $password): bool
{
    $hash = $account['password_hash'] ?? null;
    if (!is_string($hash) || $hash === '') {
        $hash = $account['password'] ?? null;
    }
    if (!is_string($hash) || password_get_info($hash)['algo'] === null) {
        return false;
    }

    return password_verify($password, $hash);
}

function administrator(): array
{
    $account = user();
    if (($account['role'] ?? '') !== 'admin') {
        respond(['error' => 'Administrator access is required.'], 403);
    }
    return $account;
}

function requireMethod(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
        header('Allow: ' . $method . ', OPTIONS');
        respond(['error' => 'This request method is not allowed.'], 405);
    }
}

function logActivity(PDO $pdo, string $action, string $entityType, ?int $entityId, array $details = []): void
{
    $account = $_SESSION['account'] ?? [];
    $actorType = in_array($account['role'] ?? '', ['user', 'admin'], true) ? ($account['role'] === 'admin' ? 'administrator' : 'user') : 'system';
    $statement = $pdo->prepare(
        'INSERT INTO activity_logs (actor_type, actor_id, action, entity_type, entity_id, details)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $statement->execute([
        $actorType,
        $account['id'] ?? null,
        $action,
        $entityType,
        $entityId,
        $details ? json_encode($details, JSON_UNESCAPED_SLASHES) : null,
    ]);
}

function queueNumber(?int $number): ?string
{
    return $number === null ? null : 'Q-' . str_pad((string)$number, 3, '0', STR_PAD_LEFT);
}

function currentDate(PDO $pdo): string
{
    return (string)$pdo->query('SELECT CURDATE()')->fetchColumn();
}

function queueSnapshot(PDO $pdo, ?int $userId = null): array
{
    $today = currentDate($pdo);
    $current = $pdo->prepare(
        "SELECT queue_number_int FROM queue_records
         WHERE service_date = ? AND service_name = 'General' AND status = 'Serving'
         ORDER BY queue_number_int LIMIT 1"
    );
    $current->execute([$today]);
    $servingNumber = $current->fetchColumn();

    $waitingStatement = $pdo->prepare(
        "SELECT queue_number_int FROM queue_records
         WHERE service_date = ? AND service_name = 'General' AND status = 'Waiting'
         ORDER BY queue_number_int"
    );
    $waitingStatement->execute([$today]);
    $waiting = array_map(
        static fn(array $row): array => ['queue_number' => queueNumber((int)$row['queue_number_int'])],
        $waitingStatement->fetchAll()
    );
    $yourQueue = null;
    if ($userId !== null) {
        $statement = $pdo->prepare(
            "SELECT q.queue_number_int, q.status
             FROM queue_records q
             JOIN appointments a ON a.id = q.appointment_id
             WHERE a.user_id = ? AND q.service_date = ? AND q.status IN ('Waiting', 'Serving')
             ORDER BY q.queue_number_int LIMIT 1"
        );
        $statement->execute([$userId, $today]);
        $record = $statement->fetch();
        if ($record) {
            $ahead = $pdo->prepare(
                "SELECT COUNT(*) FROM queue_records
                 WHERE service_date = ? AND service_name = 'General'
                   AND status = 'Waiting' AND queue_number_int < ?"
            );
            $ahead->execute([$today, $record['queue_number_int']]);
            $yourQueue = [
                'queue_number' => queueNumber((int)$record['queue_number_int']),
                'status' => $record['status'],
                'people_ahead' => (int)$ahead->fetchColumn(),
            ];
        }
    }
    return [
        'currently_serving' => $servingNumber === false ? null : queueNumber((int)$servingNumber),
        'waiting' => $waiting,
        'your_queue' => $yourQueue,
        'updated_at' => (string)$pdo->query(
            "SELECT DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ')"
        )->fetchColumn(),
    ];
}

if ($origin !== '' && !in_array($origin, $allowedOrigins, true)) {
    respond(['error' => 'This website origin is not allowed.'], 403);
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $pdo = db();
    $action = is_string($_GET['action'] ?? null) ? $_GET['action'] : '';
    $input = body();

    switch ($action) {
        case 'me':
            requireMethod('GET');
            if (!isset($_SESSION['account'])) {
                respond(['user' => null]);
            }
            respond(['user' => publicAccount(user())]);

        case 'register':
            requireMethod('POST');
            $name = requiredString($input, 'name', 120, 'Name');
            $email = strtolower(trim(inputString($input, 'email')));
            $password = inputString($input, 'password');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) {
                respond(['error' => 'Enter a valid email address.'], 422);
            }
            if (strlen($password) < 8 || strlen($password) > 72) {
                respond(['error' => 'Password must be between 8 and 72 characters.'], 422);
            }
            $adminEmail = $pdo->prepare('SELECT id FROM administrators WHERE email = ? LIMIT 1');
            $adminEmail->execute([$email]);
            if ($adminEmail->fetchColumn()) {
                respond(['error' => 'An account with this email already exists.'], 409);
            }
            $statement = $pdo->prepare(
                "INSERT INTO users (full_name, email, contact_number, password_hash, role)
                 VALUES (?, ?, '', ?, 'user')"
            );
            try {
                $statement->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
            } catch (PDOException $error) {
                if ($error->getCode() === '23000') {
                    respond(['error' => 'An account with this email already exists.'], 409);
                }
                throw $error;
            }
            session_regenerate_id(true);
            $_SESSION['account'] = [
                'id' => (int)$pdo->lastInsertId(),
                'name' => $name,
                'email' => $email,
                'contact_number' => '',
                'role' => 'user',
                '_table' => 'users',
            ];
            logActivity($pdo, 'register', 'user', $_SESSION['account']['id']);
            respond(['user' => publicAccount($_SESSION['account'])], 201);

        case 'login':
            requireMethod('POST');
            $email = strtolower(trim(inputString($input, 'email')));
            $password = inputString($input, 'password');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
                respond(['error' => 'Enter a valid email address and password.'], 422);
            }
            $statement = $pdo->prepare(
                "SELECT id, full_name, email, contact_number, password_hash, password, is_active, role
                 FROM users WHERE email = ? AND role = 'user' LIMIT 1"
            );
            $statement->execute([$email]);
            $account = $statement->fetch();
            $role = 'user';
            $table = 'users';
            if (!$account) {
                $statement = $pdo->prepare(
                    'SELECT id, full_name, email, password_hash, is_active FROM administrators WHERE email = ? LIMIT 1'
                );
                $statement->execute([$email]);
                $account = $statement->fetch();
                $role = 'admin';
                $table = 'administrators';
            }
            if (!$account) {
                $statement = $pdo->prepare(
                    "SELECT id, full_name, email, password_hash, password, is_active, role
                     FROM users WHERE email = ? AND role = 'admin' LIMIT 1"
                );
                $statement->execute([$email]);
                $account = $statement->fetch();
                $role = 'admin';
                $table = 'users';
            }
            if (!$account || !(bool)$account['is_active'] || !passwordMatches($account, $password)) {
                respond(['error' => 'Email or password is incorrect.'], 401);
            }
            $storedHash = $account['password_hash'] ?: ($account['password'] ?? '');
            if ($table === 'users' && password_needs_rehash($storedHash, PASSWORD_DEFAULT)) {
                $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                    ->execute([password_hash($password, PASSWORD_DEFAULT), $account['id']]);
            }
            session_regenerate_id(true);
            $_SESSION['account'] = [
                'id' => (int)$account['id'],
                'name' => $account['full_name'],
                'email' => $account['email'],
                'contact_number' => $account['contact_number'] ?? '',
                'role' => $role,
                '_table' => $table,
            ];
            logActivity($pdo, 'login', $role === 'admin' ? 'administrator' : 'user', (int)$account['id']);
            respond(['user' => publicAccount($_SESSION['account'])]);

        case 'logout':
            requireMethod('POST');
            if (isset($_SESSION['account'])) {
                logActivity($pdo, 'logout', 'session', null);
            }
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', [
                    'expires' => time() - 42000,
                    'path' => $params['path'],
                    'secure' => $params['secure'],
                    'httponly' => $params['httponly'],
                    'samesite' => 'Lax',
                ]);
            }
            session_destroy();
            respond(['ok' => true]);

        case 'profile':
            requireMethod('POST');
            $account = user();
            if ($account['role'] !== 'user') {
                respond(['error' => 'Administrator profiles cannot be changed here.'], 403);
            }
            $name = requiredString($input, 'full_name', 120, 'Full name');
            $contact = trim(inputString($input, 'contact_number'));
            if (mb_strlen($contact) > 30) {
                respond(['error' => 'Contact number must be no more than 30 characters.'], 422);
            }
            $pdo->prepare('UPDATE users SET full_name = ?, contact_number = ? WHERE id = ?')
                ->execute([$name, $contact, $account['id']]);
            $_SESSION['account']['name'] = $name;
            $_SESSION['account']['contact_number'] = $contact;
            logActivity($pdo, 'profile_updated', 'user', (int)$account['id']);
            respond(['user' => publicAccount($_SESSION['account'])]);

        case 'change_password':
            requireMethod('POST');
            $account = user();
            $currentPassword = inputString($input, 'current_password');
            $newPassword = inputString($input, 'new_password');
            if (strlen($newPassword) < 8 || strlen($newPassword) > 72) {
                respond(['error' => 'New password must be between 8 and 72 characters.'], 422);
            }
            $table = $account['_table'] ?? ($account['role'] === 'admin' ? 'administrators' : 'users');
            $legacyPasswordColumn = $table === 'users' ? ', password' : '';
            $statement = $pdo->prepare("SELECT password_hash$legacyPasswordColumn FROM $table WHERE id = ? AND is_active = 1");
            $statement->execute([$account['id']]);
            $passwordRow = $statement->fetch();
            if (!$passwordRow || !passwordMatches($passwordRow, $currentPassword)) {
                respond(['error' => 'Your current password is incorrect.'], 403);
            }
            $statement = $pdo->prepare("UPDATE $table SET password_hash = ? WHERE id = ?");
            $statement->execute([password_hash($newPassword, PASSWORD_DEFAULT), $account['id']]);
            logActivity($pdo, 'password_changed', $table === 'users' ? 'user' : 'administrator', (int)$account['id']);
            respond(['ok' => true]);

        case 'slots':
            requireMethod('GET');
            $date = is_string($_GET['date'] ?? null) ? $_GET['date'] : '';
            $parsedDate = DateTime::createFromFormat('!Y-m-d', $date);
            if (!$parsedDate || $parsedDate->format('Y-m-d') !== $date || $date < currentDate($pdo)) {
                respond(['error' => 'Choose a valid date that is today or later.'], 422);
            }
            $statement = $pdo->prepare(
                "SELECT s.time_slot, s.capacity,
                        COUNT(CASE WHEN a.status IN ('Pending', 'Confirmed') THEN 1 END) AS booked
                 FROM schedules s
                 LEFT JOIN appointments a ON a.schedule_id = s.id
                 WHERE s.service_date = ? AND s.is_available = 1
                 GROUP BY s.id, s.time_slot, s.capacity
                 HAVING booked < s.capacity
                 ORDER BY s.time_slot"
            );
            $statement->execute([$date]);
            $slots = array_map(static function (array $row): array {
                return ['time_slot' => $row['time_slot'], 'remaining' => (int)$row['capacity'] - (int)$row['booked']];
            }, $statement->fetchAll());
            respond(['slots' => $slots]);

        case 'appointments':
            requireMethod('GET');
            $account = user();
            if ($account['role'] !== 'user') {
                respond(['appointments' => []]);
            }
            $statement = $pdo->prepare(
                "SELECT a.id, a.full_name, a.contact_number, a.email, a.purpose, a.notes, a.status,
                        s.service_date AS appointment_date, s.time_slot, q.queue_number_int
                 FROM appointments a
                 JOIN schedules s ON s.id = a.schedule_id
                 LEFT JOIN queue_records q ON q.appointment_id = a.id
                 WHERE a.user_id = ?
                 ORDER BY s.service_date DESC, s.time_slot DESC, a.id DESC"
            );
            $statement->execute([$account['id']]);
            $appointments = $statement->fetchAll();
            foreach ($appointments as &$appointment) {
                $appointment['queue_number'] = queueNumber($appointment['queue_number_int'] === null ? null : (int)$appointment['queue_number_int']);
                unset($appointment['queue_number_int']);
            }
            unset($appointment);
            respond(['appointments' => $appointments]);

        case 'stats':
            requireMethod('GET');
            $account = user();
            if ($account['role'] !== 'user') {
                respond(['total_appointments' => 0, 'upcoming_appointments' => 0]);
            }
            $statement = $pdo->prepare(
                "SELECT COUNT(*) AS total,
                        SUM(CASE WHEN a.status IN ('Pending', 'Confirmed') AND s.service_date >= CURDATE() THEN 1 ELSE 0 END) AS upcoming
                 FROM appointments a JOIN schedules s ON s.id = a.schedule_id WHERE a.user_id = ?"
            );
            $statement->execute([$account['id']]);
            $counts = $statement->fetch();
            $queue = queueSnapshot($pdo, (int)$account['id'])['your_queue'];
            respond([
                'total_appointments' => (int)$counts['total'],
                'upcoming_appointments' => (int)$counts['upcoming'],
                'queue_number' => $queue['queue_number'] ?? null,
                'queue_status' => $queue['status'] ?? null,
                'currently_serving' => queueSnapshot($pdo)['currently_serving'],
                'people_ahead' => $queue['people_ahead'] ?? null,
            ]);

        case 'book':
            requireMethod('POST');
            $account = user();
            if ($account['role'] !== 'user') {
                respond(['error' => 'Only user accounts can book appointments.'], 403);
            }
            $name = requiredString($input, 'full_name', 120, 'Full name');
            $phone = requiredString($input, 'contact_number', 30, 'Contact number');
            $email = strtolower(trim(inputString($input, 'email')));
            $purpose = requiredString($input, 'purpose', 160, 'Appointment purpose');
            $notes = trim(inputString($input, 'notes'));
            $date = inputString($input, 'appointment_date');
            $slot = requiredString($input, 'time_slot', 40, 'Time slot');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) {
                respond(['error' => 'Enter a valid email address.'], 422);
            }
            if (mb_strlen($notes) > 1000) {
                respond(['error' => 'Notes must be no more than 1000 characters.'], 422);
            }
            $parsedDate = DateTime::createFromFormat('!Y-m-d', $date);
            if (!$parsedDate || $parsedDate->format('Y-m-d') !== $date || $date < currentDate($pdo)) {
                respond(['error' => 'Choose a valid appointment date that is today or later.'], 422);
            }
            $pdo->beginTransaction();
            $statement = $pdo->prepare('SELECT id, capacity FROM schedules WHERE service_date = ? AND time_slot = ? AND is_available = 1 FOR UPDATE');
            $statement->execute([$date, $slot]);
            $schedule = $statement->fetch();
            if (!$schedule) {
                $pdo->rollBack();
                respond(['error' => 'That appointment time is no longer available. Please choose another slot.'], 409);
            }
            $count = $pdo->prepare("SELECT COUNT(*) FROM appointments WHERE schedule_id = ? AND status IN ('Pending', 'Confirmed')");
            $count->execute([$schedule['id']]);
            if ((int)$count->fetchColumn() >= (int)$schedule['capacity']) {
                $pdo->rollBack();
                respond(['error' => 'That appointment time has reached capacity. Please choose another slot.'], 409);
            }
            $statement = $pdo->prepare(
                "INSERT INTO appointments
                    (user_id, schedule_id, appointment_date, time_slot, details,
                     full_name, contact_number, email, purpose, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            $statement->execute([
                $account['id'],
                $schedule['id'],
                $date,
                $slot,
                $purpose,
                $name,
                $phone,
                $email,
                $purpose,
                $notes,
            ]);
            $appointmentId = (int)$pdo->lastInsertId();
            logActivity($pdo, 'appointment_requested', 'appointment', $appointmentId);
            $pdo->commit();
            respond(['ok' => true, 'id' => $appointmentId], 201);

        case 'cancel':
            requireMethod('POST');
            $account = user();
            $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
            if (!$id) {
                respond(['error' => 'A valid appointment is required.'], 422);
            }
            $dateStatement = $pdo->prepare(
                'SELECT s.service_date FROM appointments a JOIN schedules s ON s.id = a.schedule_id
                 WHERE a.id = ? AND a.user_id = ?'
            );
            $dateStatement->execute([$id, $account['id']]);
            $serviceDate = $dateStatement->fetchColumn();
            if (!$serviceDate) {
                respond(['error' => 'Appointment not found.'], 404);
            }
            $pdo->beginTransaction();
            $scheduleLocks = $pdo->prepare('SELECT id FROM schedules WHERE service_date = ? FOR UPDATE');
            $scheduleLocks->execute([$serviceDate]);
            $statement = $pdo->prepare('SELECT id, status FROM appointments WHERE id = ? AND user_id = ? FOR UPDATE');
            $statement->execute([$id, $account['id']]);
            $appointment = $statement->fetch();
            if (!$appointment) {
                $pdo->rollBack();
                respond(['error' => 'Appointment not found.'], 404);
            }
            if (!in_array($appointment['status'], ['Pending', 'Confirmed'], true)) {
                $pdo->rollBack();
                respond(['error' => 'This appointment can no longer be cancelled.'], 409);
            }
            $queue = $pdo->prepare("SELECT status FROM queue_records WHERE appointment_id = ? FOR UPDATE");
            $queue->execute([$id]);
            $queueStatus = $queue->fetchColumn();
            if ($queueStatus === 'Serving') {
                $pdo->rollBack();
                respond(['error' => 'An appointment currently being served cannot be cancelled.'], 409);
            }
            $pdo->prepare("UPDATE appointments SET status = 'Cancelled' WHERE id = ?")->execute([$id]);
            $pdo->prepare("UPDATE queue_records SET status = 'Cancelled' WHERE appointment_id = ? AND status = 'Waiting'")->execute([$id]);
            logActivity($pdo, 'appointment_cancelled', 'appointment', (int)$id);
            $pdo->commit();
            respond(['ok' => true]);

        case 'queue':
            requireMethod('GET');
            $account = isset($_SESSION['account']) ? user() : null;
            respond(queueSnapshot($pdo, ($account && $account['role'] === 'user') ? (int)$account['id'] : null));

        case 'admin_dashboard':
            requireMethod('GET');
            administrator();
            $stats = $pdo->query(
                "SELECT (SELECT COUNT(*) FROM users WHERE role = 'user') AS total_users,
                        COUNT(*) AS total_appointments,
                        SUM(a.status = 'Pending') AS pending_appointments,
                        SUM(a.status = 'Confirmed') AS confirmed_appointments,
                        SUM(a.status = 'Completed') AS completed_appointments
                 FROM appointments a"
            )->fetch();
            $waiting = (int)$pdo->query(
                "SELECT COUNT(*) FROM queue_records
                 WHERE service_date = CURDATE() AND service_name = 'General' AND status = 'Waiting'"
            )->fetchColumn();
            $statement = $pdo->query(
                'SELECT a.id, a.full_name, a.contact_number, a.email, a.purpose, a.status,
                        s.service_date AS appointment_date, s.time_slot, q.queue_number_int, q.status AS queue_status
                 FROM appointments a
                 JOIN schedules s ON s.id = a.schedule_id
                 LEFT JOIN queue_records q ON q.appointment_id = a.id
                 ORDER BY s.service_date DESC, s.time_slot, a.id DESC LIMIT 200'
            );
            $appointments = $statement->fetchAll();
            foreach ($appointments as &$appointment) {
                $appointment['queue_number'] = queueNumber(
                    $appointment['queue_number_int'] === null ? null : (int)$appointment['queue_number_int']
                );
                unset($appointment['queue_number_int']);
            }
            unset($appointment);
            $schedules = $pdo->query(
                "SELECT s.id, s.service_date, s.time_slot, s.capacity,
                        COUNT(CASE WHEN a.status IN ('Pending', 'Confirmed') THEN 1 END) AS booked
                 FROM schedules s LEFT JOIN appointments a ON a.schedule_id = s.id
                 WHERE s.service_date >= CURDATE()
                 GROUP BY s.id, s.service_date, s.time_slot, s.capacity
                 ORDER BY s.service_date, s.time_slot LIMIT 100"
            )->fetchAll();
            $monthly = $pdo->query("SELECT COUNT(*) FROM appointments WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')")->fetchColumn();
            $daily = $pdo->query('SELECT COUNT(*) FROM appointments a JOIN schedules s ON s.id = a.schedule_id WHERE s.service_date = CURDATE()')->fetchColumn();
            $snapshot = queueSnapshot($pdo);
            $queueRecords = $pdo->query(
                "SELECT q.id, q.appointment_id, q.queue_number_int, q.status,
                        a.full_name, a.purpose
                 FROM queue_records q
                 JOIN appointments a ON a.id = q.appointment_id
                 WHERE q.service_date = CURDATE() AND q.service_name = 'General'
                 ORDER BY q.queue_number_int"
            )->fetchAll();
            foreach ($queueRecords as &$record) {
                $record['queue_number'] = queueNumber((int)$record['queue_number_int']);
                unset($record['queue_number_int']);
            }
            unset($record);
            $snapshot['records'] = $queueRecords;
            respond([
                'stats' => [
                    'total_users' => (int)$stats['total_users'],
                    'total_appointments' => (int)$stats['total_appointments'],
                    'pending_appointments' => (int)$stats['pending_appointments'],
                    'confirmed_appointments' => (int)$stats['confirmed_appointments'],
                    'completed' => (int)$stats['completed_appointments'],
                    'waiting' => $waiting,
                ],
                'appointments' => $appointments,
                'queue' => $snapshot,
                'schedules' => $schedules,
                'reports' => ['monthly' => (int)$monthly, 'daily' => (int)$daily],
            ]);

        case 'admin_decision':
            requireMethod('POST');
            administrator();
            $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
            $status = inputString($input, 'status');
            if (!$id || !in_array($status, ['Confirmed', 'Rejected'], true)) {
                respond(['error' => 'Choose a valid appointment and decision.'], 422);
            }
            $dateStatement = $pdo->prepare(
                'SELECT s.service_date FROM appointments a JOIN schedules s ON s.id = a.schedule_id WHERE a.id = ?'
            );
            $dateStatement->execute([$id]);
            $serviceDate = $dateStatement->fetchColumn();
            if (!$serviceDate) {
                respond(['error' => 'Appointment not found.'], 404);
            }
            $pdo->beginTransaction();
            $locks = $pdo->prepare('SELECT id FROM schedules WHERE service_date = ? FOR UPDATE');
            $locks->execute([$serviceDate]);
            $statement = $pdo->prepare('SELECT id, status FROM appointments WHERE id = ? FOR UPDATE');
            $statement->execute([$id]);
            $appointment = $statement->fetch();
            if (!$appointment || $appointment['status'] !== 'Pending') {
                $pdo->rollBack();
                respond(['error' => 'This request is no longer pending. Refresh and try again.'], 409);
            }
            if ($status === 'Confirmed') {
                $maxStatement = $pdo->prepare(
                    "SELECT COALESCE(MAX(queue_number_int), 0) FROM queue_records
                     WHERE service_date = ? AND service_name = 'General'"
                );
                $maxStatement->execute([$serviceDate]);
                $nextNumber = (int)$maxStatement->fetchColumn() + 1;
                $pdo->prepare(
                    "INSERT INTO queue_records
                        (appointment_id, queue_date, service_date, service_name, queue_number, queue_number_int, status)
                     VALUES (?, ?, ?, 'General', ?, ?, 'Waiting')"
                )->execute([
                    $id,
                    $serviceDate,
                    $serviceDate,
                    queueNumber($nextNumber),
                    $nextNumber,
                ]);
            }
            $pdo->prepare('UPDATE appointments SET status = ? WHERE id = ?')->execute([$status, $id]);
            logActivity($pdo, 'appointment_' . strtolower($status), 'appointment', (int)$id);
            $pdo->commit();
            respond(['ok' => true]);

        case 'admin_next':
            requireMethod('POST');
            administrator();
            $pdo->beginTransaction();
            $today = currentDate($pdo);
            $scheduleLocks = $pdo->prepare('SELECT id FROM schedules WHERE service_date = ? FOR UPDATE');
            $scheduleLocks->execute([$today]);
            $currentStatement = $pdo->prepare(
                "SELECT id, appointment_id FROM queue_records
                 WHERE service_date = ? AND service_name = 'General' AND status = 'Serving'
                 ORDER BY queue_number_int LIMIT 1 FOR UPDATE"
            );
            $currentStatement->execute([$today]);
            $current = $currentStatement->fetch();
            if ($current) {
                $pdo->prepare("UPDATE queue_records SET status = 'Completed' WHERE id = ?")->execute([$current['id']]);
                $pdo->prepare("UPDATE appointments SET status = 'Completed' WHERE id = ?")->execute([$current['appointment_id']]);
            }
            $nextStatement = $pdo->prepare(
                "SELECT id, appointment_id, queue_number_int FROM queue_records
                 WHERE service_date = ? AND service_name = 'General' AND status = 'Waiting'
                 ORDER BY queue_number_int LIMIT 1 FOR UPDATE"
            );
            $nextStatement->execute([$today]);
            $next = $nextStatement->fetch();
            if ($next) {
                $pdo->prepare("UPDATE queue_records SET status = 'Serving' WHERE id = ?")->execute([$next['id']]);
                logActivity($pdo, 'queue_called', 'queue_record', (int)$next['id']);
            }
            $pdo->commit();
            respond(['ok' => true, 'currently_serving' => $next ? queueNumber((int)$next['queue_number_int']) : null]);

        case 'admin_skip':
            requireMethod('POST');
            administrator();
            $pdo->beginTransaction();
            $today = currentDate($pdo);
            $scheduleLocks = $pdo->prepare('SELECT id FROM schedules WHERE service_date = ? FOR UPDATE');
            $scheduleLocks->execute([$today]);
            $statement = $pdo->prepare(
                "SELECT id FROM queue_records
                 WHERE service_date = ? AND service_name = 'General' AND status = 'Serving'
                 ORDER BY queue_number_int LIMIT 1 FOR UPDATE"
            );
            $statement->execute([$today]);
            $recordId = $statement->fetchColumn();
            if (!$recordId) {
                $pdo->rollBack();
                respond(['error' => 'There is no currently serving queue number to skip.'], 409);
            }
            $pdo->prepare("UPDATE queue_records SET status = 'Skipped' WHERE id = ?")->execute([$recordId]);
            logActivity($pdo, 'queue_skipped', 'queue_record', (int)$recordId);
            $pdo->commit();
            respond(['ok' => true]);

        case 'admin_queue_status':
            requireMethod('POST');
            administrator();
            $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
            $status = inputString($input, 'status');
            if (!$id || !in_array($status, ['Serving', 'Completed', 'Skipped', 'Cancelled'], true)) {
                respond(['error' => 'Choose a valid queue record and status.'], 422);
            }
            $pdo->beginTransaction();
            $dateStatement = $pdo->prepare('SELECT service_date FROM queue_records WHERE id = ?');
            $dateStatement->execute([$id]);
            $serviceDate = $dateStatement->fetchColumn();
            if (!$serviceDate) {
                $pdo->rollBack();
                respond(['error' => 'Queue record not found.'], 404);
            }
            $scheduleLocks = $pdo->prepare('SELECT id FROM schedules WHERE service_date = ? FOR UPDATE');
            $scheduleLocks->execute([$serviceDate]);
            $recordStatement = $pdo->prepare(
                'SELECT id, appointment_id, service_date, status
                 FROM queue_records WHERE id = ? FOR UPDATE'
            );
            $recordStatement->execute([$id]);
            $record = $recordStatement->fetch();
            if (!$record) {
                $pdo->rollBack();
                respond(['error' => 'Queue record not found.'], 404);
            }
            $allowedTransitions = [
                'Waiting' => ['Serving', 'Skipped', 'Cancelled'],
                'Serving' => ['Completed', 'Skipped', 'Cancelled'],
            ];
            if (!in_array($status, $allowedTransitions[$record['status']] ?? [], true)) {
                $pdo->rollBack();
                respond(['error' => 'This queue record can no longer be changed to that status.'], 409);
            }
            if ($status === 'Serving') {
                $current = $pdo->prepare(
                    "SELECT id FROM queue_records
                     WHERE service_date = ? AND service_name = 'General' AND status = 'Serving'
                     LIMIT 1 FOR UPDATE"
                );
                $current->execute([$record['service_date']]);
                if ($current->fetchColumn()) {
                    $pdo->rollBack();
                    respond(['error' => 'Complete or skip the current number before calling another.'], 409);
                }
            }
            $pdo->prepare('UPDATE queue_records SET status = ? WHERE id = ?')->execute([$status, $id]);
            if ($status === 'Completed') {
                $pdo->prepare("UPDATE appointments SET status = 'Completed' WHERE id = ?")
                    ->execute([$record['appointment_id']]);
            } elseif ($status === 'Cancelled') {
                $pdo->prepare("UPDATE appointments SET status = 'Cancelled' WHERE id = ?")
                    ->execute([$record['appointment_id']]);
            }
            logActivity($pdo, 'queue_' . strtolower($status), 'queue_record', (int)$id);
            $pdo->commit();
            respond(['ok' => true]);

        case 'admin_schedule':
            requireMethod('POST');
            administrator();
            $date = inputString($input, 'service_date');
            $slot = requiredString($input, 'time_slot', 40, 'Time slot');
            $capacity = filter_var($input['capacity'] ?? null, FILTER_VALIDATE_INT);
            $parsedDate = DateTime::createFromFormat('!Y-m-d', $date);
            if (!$parsedDate || $parsedDate->format('Y-m-d') !== $date || $date < currentDate($pdo)) {
                respond(['error' => 'Choose a valid schedule date that is today or later.'], 422);
            }
            if (!$capacity || $capacity > 500) {
                respond(['error' => 'Capacity must be between 1 and 500.'], 422);
            }
            $pdo->beginTransaction();
            $statement = $pdo->prepare('SELECT id FROM schedules WHERE service_date = ? AND time_slot = ? FOR UPDATE');
            $statement->execute([$date, $slot]);
            $existing = $statement->fetchColumn();
            if ($existing) {
                $count = $pdo->prepare("SELECT COUNT(*) FROM appointments WHERE schedule_id = ? AND status IN ('Pending', 'Confirmed')");
                $count->execute([$existing]);
                if ($capacity < (int)$count->fetchColumn()) {
                    $pdo->rollBack();
                    respond(['error' => 'Capacity cannot be lower than the number of active bookings.'], 409);
                }
                $pdo->prepare('UPDATE schedules SET capacity = ?, is_available = 1 WHERE id = ?')->execute([$capacity, $existing]);
                $scheduleId = (int)$existing;
            } else {
                $pdo->prepare('INSERT INTO schedules (service_date, time_slot, capacity) VALUES (?, ?, ?)')->execute([$date, $slot, $capacity]);
                $scheduleId = (int)$pdo->lastInsertId();
            }
            logActivity($pdo, 'schedule_saved', 'schedule', $scheduleId);
            $pdo->commit();
            respond(['ok' => true]);

        case 'admin_users':
            requireMethod('GET');
            administrator();
            $users = $pdo->query(
                "SELECT u.id, u.full_name, u.email, u.contact_number, u.is_active, u.created_at,
                        COUNT(a.id) AS appointment_count
                 FROM users u LEFT JOIN appointments a ON a.user_id = u.id
                     WHERE u.role = 'user'
                     GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200"
            )->fetchAll();
            respond(['users' => $users]);

        case 'admin_user':
            requireMethod('POST');
            $admin = administrator();
            $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
            $active = filter_var($input['is_active'] ?? null, FILTER_VALIDATE_INT);
            if (!$id || !in_array($active, [0, 1], true)) {
                respond(['error' => 'Choose a valid user and account status.'], 422);
            }
            if ((int)$admin['id'] === (int)$id) {
                respond(['error' => 'You cannot deactivate your own account.'], 409);
            }
            $statement = $pdo->prepare("UPDATE users SET is_active = ? WHERE id = ? AND role = 'user'");
            $statement->execute([$active, $id]);
            if ($statement->rowCount() === 0) {
                $check = $pdo->prepare("SELECT id FROM users WHERE id = ? AND role = 'user'");
                $check->execute([$id]);
                if (!$check->fetchColumn()) {
                    respond(['error' => 'User not found.'], 404);
                }
            }
            logActivity($pdo, $active ? 'user_activated' : 'user_deactivated', 'user', (int)$id);
            respond(['ok' => true]);

        default:
            respond(['error' => 'Unknown API action.'], 404);
    }
} catch (Throwable $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[QueueEase API] ' . $error->getMessage());
    respond(['error' => 'The server could not complete this request. Check the server configuration and try again.'], 500);
}
