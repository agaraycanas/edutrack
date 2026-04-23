<?php
header('Content-Type: text/html; charset=UTF-8');

include ("util.php");

error_reporting(0); // TODO daba errores el new SimpleXML con el 2o param a null

//------------------------------------------------
// Comienzo del programa "index.php"
//------------------------------------------------

$fProgramacion = "dat/programaciones.xml";
$programacion = new SimpleXMLElement($fProgramacion, null, true);

$fVacaciones = "dat/festivos.xml";
$vacaciones = new SimpleXMLElement($fVacaciones, null, true);
/*
$minutosPorSesion = 50;
$horasPorSesion = $minutosPorSesion / 60;
 */

echo '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xml:lang="es" xmlns="http://www.w3.org/1999/xhtml">
	<head>
		<meta http-equiv="Content-type" content="text/html; charset=utf-8" />
		<link rel="stylesheet" href="css/estilos.css" media="all" />
		<title>.:: Estimaci&oacute;n de progreso de programaciones ::.</title>
	</head>
	<body>		<h1>Estimaci&oacute;n de progreso de programaciones</h1>		
	';
        
echo '<h2><a style="color:white" href="hacerSeguimiento.php">Informe de seguimiento</a></h2>';
foreach ($programacion as $dpto) {
    echo "<h1>" . $dpto["nombre"] . "</h1>";
    echo '<table>';
    echo '<tr>
            <th><acronym title="Siglas del CURSO">Curso</acronym></th>
            <th><acronym title="Nombre de la ASIGNATURA">Asignatura</acronym></th>
            <th><acronym title="Nombre del GRUPO">Gr</acronym></th>
            <th><acronym title="Número de SESIONES (clases) impartidas hasta el día de hoy">Ss</acronym></th>
            <th><acronym title="Número de HORAS impartidas. Depende de la duración de cada sesión">Hr</acronym></th>
            <th><acronym title="Número de SEMANAS impartidas">Sem</acronym></th>
            <th><acronym title="Número de MESES impartidos">Mes</acronym></th>
            <th><acronym title="NÚMERO del TEMA actual (según la programación inicial)">Tema</acronym></th>
            <th><acronym title="TÍTULO del TEMA actual (según la programación inicial)">T&iacute;tulo</acronym></th>
            <th><acronym title="PORCENTAJE teórico de PROGRESO en el TEMA ACTUAL (según la programación inicial)">% tema</acronym></th>
            <th><acronym title="PORCENTAJE teórico de PROGRESO en la PROGRAMACIÓN en GENERAL (según la programación inicial)">% total</acronym></th>
            <th><acronym title="Pichar para INFORMACIÓN detallada del PROGRESO REAL de cada grupo">Progreso real</acronym></th>
            </tr>';
    $flagCurso = false; //Flag para saber si hay que rellenar la celda de curso
    $flagAsignatura = false; //Flag para saber si hay que rellenar la celda de asignatura
    foreach ($dpto as $curso) {
        echo "<tr>";
        echo "<td>" . $curso["nombre"] . "</td>";
        foreach ($curso as $asignatura) {
            //Asignatura
            if ($flagCurso) {
                echo "<tr><td></td>";
            }
            echo "<td>" . $asignatura['nombre'] . "</td>";
            foreach ($asignatura->grupo as $grupo) {
                if ($flagCurso && $flagAsignatura) {
                    echo "<tr><td></td><td></td>";
                }
                if (!$flagCurso && $flagAsignatura) {
                    echo "<td></td>";
                }

                //Grupo
                echo "<td>" . $grupo['id'] . "</td>";

                //Sesiones
                $sesiones = getSesiones(
                        $grupo['inicio'], $grupo['fin'], $vacaciones, $grupo, true);
                echo "<td>" . $sesiones . "</td>";

                //Horas
                $totalHoras = $sesiones * $horasPorSesion;
                echo "<td>" . number_format($totalHoras, 0) . "</td>";

                //Semanas
                $sesionesPorSemana = $grupo['Mon'] + $grupo['Tue'] + $grupo['Wed'] + $grupo['Thu'] + $grupo['Fri'];
                $semanas = number_format($sesiones / $sesionesPorSemana, 0);
                echo "<td>" . $semanas . "</td>";

                //Meses
                $meses = number_format($semanas / 4, 0);
                echo "<td>" . $meses . "</td>";

                //Numero tema
                $temas = $asignatura->tema;
                echo "<td>" . getNTema($temas, $totalHoras) . "</td>";

                //Titulo
                echo "<td>" . getTituloTema($temas, $totalHoras) . "</td>";

                //% tema completado
                echo "<td>" . number_format(getPorcentajeTema($temas, $totalHoras), 0) . "% </td>";

                //% total completado
                echo "<td>" . number_format(getPorcentajeTotal($temas, $totalHoras), 0) . "% </td>";

                //Detalle
                echo "<td><acronym title=\"Detalle de {$asignatura['nombre']}\">";
                echo '<a href="seguimiento.php?' .
                "departamento=" . $dpto['nombre'] . "&" .
                "curso=" . $curso['nombre'] . "&" .
                "asignatura=" . $asignatura['nombre'] . "&" .
                "grupo=" . $grupo['id'] . "&" .
                "mps=" . $minutosPorSesion .
                '">Detalle</a>';
                echo '</acronym></td>';

                //Cierres y ajustes de linea
                echo "</tr>";
                $flagAsignatura = true;
                $flagCurso = true;
            }
            $flagAsignatura=false;
        }
        $flagCurso=false;
    }
}
echo "</table>";echo "        <a href=\"loginAusencias.html\" class=\"linkAusencias\">Registrar ausencias</a>				";echo "</body></html>";
?>
