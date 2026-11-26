<?php
/**
 * Aveline Picture – wysyłka formularza kontaktowego.
 * Zmień adres ODBIORCA na swój. Na OVH funkcja mail() działa od razu.
 * Nadawca (NADAWCA) musi być w domenie strony, inaczej poczta trafi do spamu.
 */
const ODBIORCA = 'kontakt@avelinepicture.pl';
const NADAWCA  = 'formularz@avelinepicture.pl';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function odpowiedz(bool $ok, string $msg, int $code = 200): void {
    $ajax = stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;
    if (!$ajax) { // zwykłe wysłanie formularza (bez JavaScript)
        header('Content-Type: text/html; charset=utf-8');
        echo '<!DOCTYPE html><meta charset="utf-8"><title>Aveline Picture</title><p style="font-family:sans-serif;padding:40px">'
            . htmlspecialchars($msg) . '</p><p style="font-family:sans-serif;padding:0 40px"><a href="index.html">Wróć na stronę</a></p>';
        exit;
    }
    http_response_code($code);
    echo json_encode(['ok' => $ok, 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') odpowiedz(false, 'Nieprawidłowe żądanie.', 405);
if (!empty($_POST['website'])) odpowiedz(true, 'Dziękuję! Wiadomość została wysłana.'); // pułapka na boty

$clean = fn($v, $max) => mb_substr(trim(str_replace(["\r", "\0"], '', (string)$v)), 0, $max);
$name    = $clean($_POST['name'] ?? '', 100);
$email   = $clean($_POST['email'] ?? '', 150);
$type    = $clean($_POST['type'] ?? '', 60);
$date    = $clean($_POST['date'] ?? '', 20);
$message = $clean($_POST['message'] ?? '', 5000);

if ($name === '' || $message === '') odpowiedz(false, 'Uzupełnij imię i wiadomość.', 422);
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) odpowiedz(false, 'Podaj poprawny adres e-mail.', 422);
if (empty($_POST['consent'])) odpowiedz(false, 'Zaznacz zgodę na przetwarzanie danych.', 422);
$name = str_replace("\n", ' ', $name);
$type = str_replace("\n", ' ', $type);

// prosty limit: 1 wiadomość na 30 s z jednej sesji
session_start();
if (isset($_SESSION['last_send']) && time() - $_SESSION['last_send'] < 30) odpowiedz(false, 'Odczekaj chwilę przed wysłaniem kolejnej wiadomości.', 429);

$subject = '=?UTF-8?B?' . base64_encode("Nowe zapytanie: $type – $name") . '?=';
$body = "Imię: $name\nE-mail: $email\nRodzaj: $type\nData: " . ($date ?: '—') . "\n\nWiadomość:\n$message\n\n--\nWysłano z formularza na stronie Aveline Picture";
$headers = implode("\r\n", [
    'From: Aveline Picture <' . NADAWCA . '>',
    'Reply-To: ' . $email,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
]);

if (mail(ODBIORCA, $subject, $body, $headers, '-f' . NADAWCA)) {
    $_SESSION['last_send'] = time();
    odpowiedz(true, 'Dziękuję! Wiadomość została wysłana – odpiszę najszybciej, jak to możliwe.');
}
odpowiedz(false, 'Nie udało się wysłać wiadomości. Napisz bezpośrednio na ' . ODBIORCA . '.', 500);
