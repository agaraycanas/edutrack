<?php
/**
 * Informe de Seguimiento de Programación - Versión 4.0 (Cálculo de Máxima y Ordenación corregidos)
 */

$datDir = __DIR__ . '/dat/';
$festivosFile = $datDir . 'festivos.xml';
$programacionesFile = $datDir . 'programaciones.xml';

// 1. Cargar Festivos
$holidays = [];
if (file_exists($festivosFile)) {
    $xml = simplexml_load_file($festivosFile);
    foreach ($xml->festivo as $f) {
        $date = trim((string)$f);
        if (!empty($date)) $holidays[] = $date;
    }
}

// 2. Función para calcular minutos lectivos
function getTeachingMinutes($start, $end, $schedule, $holidays, $absences) {
    $totalSessions = 0;
    try {
        $curr = new DateTime($start);
        $last = new DateTime($end);
        while ($curr <= $last) {
            $dayOfWeek = (int)$curr->format('N'); 
            $dateStr = $curr->format('Y-m-d');
            if ($dayOfWeek <= 5) { 
                if (!in_array($dateStr, $holidays) && !in_array($dateStr, $absences)) {
                    $totalSessions += $schedule[$dayOfWeek - 1];
                }
            }
            $curr->modify('+1 day');
        }
    } catch (Exception $e) { return 0; }
    return $totalSessions * 55;
}

// 3. Función para siglas
function generateAcronym($name) {
    $stopWords = ['de', 'la', 'en', 'y', 'a', 'los', 'las', 'del', 'al', 'el'];
    $words = explode(' ', $name);
    $filtered = array_filter($words, function($w) use ($stopWords) {
        return !in_array(mb_strtolower($w), $stopWords);
    });
    if (count($filtered) > 1) {
        $acronym = '';
        foreach ($filtered as $w) $acronym .= mb_substr($w, 0, 1);
        return mb_strtoupper($acronym);
    }
    return mb_strtoupper(mb_substr(reset($filtered), 0, 3));
}

// 4. Cargar Base de Datos de Programaciones
$progDb = [];
if (file_exists($programacionesFile)) {
    $xmlProg = simplexml_load_file($programacionesFile);
    foreach ($xmlProg->departamento->curso as $curso) {
        $courseName = (string)$curso['nombre'];
        foreach ($curso->asignatura as $asig) {
            $subName = (string)$asig['nombre'];
            $grupo = $asig->grupo;
            $id = (string)$grupo['id'];
            $progDb["$id|$subName"] = [
                'course' => $courseName,
                'profe'  => (string)$grupo['profe'],
                'schedule' => [(int)$grupo['Mon'], (int)$grupo['Tue'], (int)$grupo['Wed'], (int)$grupo['Thu'], (int)$grupo['Fri']],
                'topics' => []
            ];
            foreach ($asig->tema as $t) {
                $progDb["$id|$subName"]['topics'][(string)$t['n']] = (float)$t['horas'];
            }
        }
    }
}

// 5. Procesar Seguimientos
$results = [];
foreach (glob($datDir . "seguimiento-*.xml") as $filename) {
    $teacherName = str_replace(['seguimiento-', '.xml'], '', basename($filename));
    
    $absences = [];
    $absFile = $datDir . "faltas-$teacherName.xml";
    if (file_exists($absFile)) {
        $xmlAbs = simplexml_load_file($absFile);
        foreach ($xmlAbs->falta as $fa) $absences[] = trim((string)$fa);
    }
    
    $xmlSeg = simplexml_load_file($filename);
    foreach ($xmlSeg->asignatura as $asig) {
        $key = (string)$asig['grupo'] . "|" . (string)$asig['nombre'];
        if (!isset($progDb[$key]) || $progDb[$key]['profe'] !== $teacherName) continue;
        
        $info = $progDb[$key];
        $totalDev = 0;
        $latestTimestamp = 0; 
        
        foreach ($asig->tema as $tema) {
            $fi = trim((string)$tema['fini']);
            $ff = trim((string)$tema['ffin']);
            
            // CORRECCIÓN: Evaluar fecha más reciente usando timestamps
            foreach ([$fi, $ff] as $dateStr) {
                if (!empty($dateStr)) {
                    $ts = strtotime($dateStr);
                    if ($ts > $latestTimestamp) $latestTimestamp = $ts;
                }
            }
            
            if (!empty($fi) && !empty($ff)) {
                $minutos = getTeachingMinutes($fi, $ff, $info['schedule'], $holidays, $absences);
                $actualHours = round($minutos / 60);
                $targetHours = $info['topics'][(string)$tema['n']] ?? 0;
                $totalDev += ($targetHours - $actualHours);
            }
        }
        
        $results[] = [
            'group'    => $info['course'],
            'teacher'  => $info['profe'],
            'module'   => generateAcronym((string)$asig['nombre']),
            'dev'      => $totalDev,
            'timestamp'=> $latestTimestamp, // Para la ordenación
            'updated'  => ($latestTimestamp > 0) ? date('Y-m-d', $latestTimestamp) : '1900-01-01'
        ];
    }
}

// 6. ORDENACIÓN CORREGIDA: Por timestamp (Cronológico ASC)
usort($results, function($a, $b) {
    if ($a['timestamp'] === $b['timestamp']) {
        return strcmp($a['group'], $b['group']);
    }
    return $a['timestamp'] <=> $b['timestamp'];
});
?>

<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f0f2f5; padding: 20px; }
        .card { max-width: 950px; margin: auto; background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h2 { color: #1a73e8; border-bottom: 2px solid #e8eaed; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th { background: #1a73e8; color: white; padding: 12px; text-align: left; font-size: 0.85em; text-transform: uppercase; }
        td { padding: 12px; border-bottom: 1px solid #f1f3f4; }
        tr:hover { background: #f8f9fa; }
        .pos { color: #1e8e3e; font-weight: bold; }
        .neg { color: #d93025; font-weight: bold; }
        .date { font-family: 'Courier New', monospace; color: #5f6368; font-weight: bold; }
    </style>
</head>
<body>
    <div class="card">
        <h2>Informe de Seguimiento de Programación</h2>
        <button onclick='window.location.href="index.php"'>VOLVER</button>
        <table>
            <thead>
                <tr>
                    <th>GRUPO</th>
                    <th>PROFESOR</th>
                    <th>MÓDULO</th>
                    <th>DESV.</th>
                    <th>ACTUALIZADO</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($results as $r): ?>
                <tr>
                    <td><?= htmlspecialchars($r['group']) ?></td>
                    <td><strong><?= htmlspecialchars($r['teacher']) ?></strong></td>
                    <td><?= htmlspecialchars($r['module']) ?></td>
                    <td class="<?= $r['dev'] > 0 ? 'pos' : ($r['dev'] < 0 ? 'neg' : '') ?>">
                        <?= ($r['dev'] > 0 ? '+' : '') . $r['dev'] ?>
                    </td>
                    <td class="date">
                        <?= ($r['timestamp'] === 0) ? '<span style="color:#f29900">Pendiente</span>' : htmlspecialchars($r['updated']) ?>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</body>
</html>