<?php
header('Content-Type: text/html; charset=UTF-8');

include("util.php");
//------------------------------------------------
// Comienzo del programa "seguimiento.php"
//------------------------------------------------
$nombre_dpto = $_REQUEST['departamento'];
$nombre_curso = $_REQUEST['curso'];
$nombre_asignatura = $_REQUEST['asignatura'];
$nombre_grupo = $_REQUEST['grupo'];
$minutosPorSesion = $_REQUEST['mps'];
$horasPorSesion = $minutosPorSesion / 60;

$fVacaciones = "dat/festivos.xml";
$vacaciones = new SimpleXMLElement($fVacaciones, null, true);


echo '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xml:lang="es" xmlns="http://www.w3.org/1999/xhtml">
	<head>
		<meta http-equiv="Content-type" content="text/html; charset=utf-8" />
		<link rel="stylesheet" href="css/estilos.css" media="all" />
		<title>.:: Progreso de ' .
 $nombre_asignatura . " (" .
 $nombre_grupo . ")" .
 '::.</title>';
?>
<script language="JavaScript" src="calendario/javascripts.js">
</script>
<?php

echo '</head>
	<body>
	<h1>Progreso de ' .
 $nombre_asignatura . " (" .
 $nombre_grupo . ")" .
 '</h1>';

$grupo = getDatosGrupo($nombre_dpto, $nombre_curso, $nombre_asignatura, $nombre_grupo);
$temas = getTemasAsignatura($nombre_dpto, $nombre_curso, $nombre_asignatura);
$seguimientoTemas = getSeguimientoAsignatura($grupo['nif'], $nombre_asignatura, $grupo['id']);

echo '<form name="formulario" action="guardarSeguimiento.php" method="post">
    ';
echo '<input type="submit" value="Guardar cambios">
    ';
echo '<input type="button" id="Volver" value="Volver a programaciones" onclick="cerrar()" />
    ';
echo '<input type="hidden" name="nif" value="' . $grupo['nif'] . '"/>
    ';
echo '<input type="hidden" name="departamento" value="' . $nombre_dpto . '"/>
    ';
echo '<input type="hidden" name="curso" value="' . $nombre_curso . '"/>
    ';
echo '<input type="hidden" name="asignatura" value="' . $nombre_asignatura . '"/>
    ';
echo '<input type="hidden" name="grupo" value="' . $nombre_grupo . '"/>
    ';
echo '<input type="hidden" name="mps" value="' . $minutosPorSesion . '"/>
    ';
echo '<table>
    ';
echo '<tr>
			<th>Tema</th>
			<th>T&iacute;tulo</th>
			<th>F.inicio</th>
			<th>F.fin</th>
			<th>H.est.</th>
			<th>H.real</th>
			<th>H.dif</th>
			<th>Comentarios</th>
		</tr>
                ';
$nTema = 0;
$fechas[$nTema]['n'] = "-";
$i = 1;
foreach ($temas as $tema) {
    $fechas[++$nTema]['n'] = $tema['n'];
    echo "<tr>
        ";

    //**********************************************
    //Número de tema
    //**********************************************
    echo "<td>" . $tema['n'] . "</td>
        ";

    //**********************************************
    //TITULO
    //**********************************************
    echo "<td>" . $tema['titulo'] . "</td>
        ";

    //**********************************************
    //FECHA de INICIO del tema
    //**********************************************
    $fechas[$nTema]['fini'] = getFiniSeguimiento($seguimientoTemas, $tema['n']);
    if ($fechas[$nTema]['fini'] != "") {
        $fechaAImprimir = date("j-n-Y", strtotime($fechas[$nTema]['fini']));
    } else {
        $fechaAImprimir = "";
    }
    echo '<td><input type="text" name="fini' . $i . '" value="' . $fechaAImprimir . '"
         onclick="muestraCalendario(\'\',\'formulario\',\'fini' . $i
    . '\')" onfocus="blur()"/>';

    //--------------------------------
    // Boton de LIMPIAR fecha de inicio
    //--------------------------------
    echo '<input type="button" class="imgLimpiar" onclick="limpiar(document.formulario.fini'.$i.')"/>';
    echo '</td>
        ';

    //**********************************************
    //FECHA de FIN del tema
    //**********************************************
    $fechas[$nTema]['ffin'] = getFfinSeguimiento($seguimientoTemas, $tema['n']);
    if ($fechas[$nTema]['ffin'] != "") {
        $fechaAImprimir = date("j-n-Y", strtotime($fechas[$nTema]['ffin']));
    } else {
        $fechaAImprimir = "";
    }
    echo '<td><input type="text" name="ffin' . $i . '" value="' . $fechaAImprimir . '"
         onclick="muestraCalendario(\'\',\'formulario\',\'ffin' . $i
    . '\')" onfocus="blur()"/>';
    
    //--------------------------------
    // Boton de LIMPIAR fecha de fin
    //--------------------------------
	echo '<input type="button" class="imgLimpiar" onclick="limpiar(document.formulario.ffin'.$i.')"/>';
    echo '</td>
        ';

    //**********************************************
    //HORAS previstas programadas para el tema
    //**********************************************
    $horasPrevistas = $tema['horas'];
    echo "<td>" . $horasPrevistas . "</td>
        ";

    //**********************************************
    //HORAS REALES impartidas
    //**********************************************
    $horasReales = 0;
    if ($fechas[$nTema]['fini'] != "") {
        $grupo = getDatosGrupo($nombre_dpto, $nombre_curso, $nombre_asignatura, $nombre_grupo);
        if ($fechas[$nTema]['ffin'] != "") {
            $sesiones = getSesiones(//calcula las horas reales entre dos fechas
                    $fechas[$nTema]['fini'], $fechas[$nTema]['ffin'], $vacaciones, $grupo, false);
            
            $horasReales = number_format($sesiones * $horasPorSesion, 0); //DEBUG-ORIG
            //$horasReales = "$sesiones // $horasPorSesion"; //DEBUG-TEST
        } else {
            $sesiones = getSesiones(//Calcula las horas reales hasta hoy
                    $fechas[$nTema]['fini'], $fechas[$nTema]['ffin'], $vacaciones, $grupo, true);
            $horasReales = number_format($sesiones * $horasPorSesion, 0);//DEBUG-ORIG
            //$horasReales = "$sesiones // $horasPorSesion"; //DEBUG-TEST
        }
    }

    echo "<td>".
            (($fechas[$nTema]['fini']!="" && $fechas[$nTema]['ffin'] == "")?
            "<span class=\"pendiente\">" : "") .
            ($horasReales != 0 ? $horasReales : '') . 
            (($fechas[$nTema]['fini']!="" && $fechas[$nTema]['ffin'] == "")?
            "</span>" : "").
          "</td>
        ";

    //**********************************************
    //DIFERENCIA entre HORAS REALES y PREVISTAS
    //**********************************************
    echo "<td>" . 
            (($fechas[$nTema]['fini']!="" && $fechas[$nTema]['ffin'] == "")?
            "<span class=\"pendiente\">" : "") .
            ($horasReales != 0 ? ($horasReales - $horasPrevistas) : '') . 
            (($fechas[$nTema]['fini']!="" && $fechas[$nTema]['ffin'] == "")?
            "</span>" : "").
            "</td>
        ";


    //**********************************************
    //COMENTARIO acerca del desfase en la programacion (si procediera)
    //**********************************************
    echo '<td><input type=text name="comentario' . $i . '" value="' .
    getComentarioSeguimiento($seguimientoTemas, $tema['n']) . '" 
        onclick="editarComentario(this);"></td>
        ';
    echo "</tr>
        
    ";
    $i++;
}
echo '</table>
    ';
echo '<input type="submit" value="Guardar cambios"/>
    ';
echo '<input type="button" id="Volver" value="Volver a programaciones" onclick="cerrar()" />
    ';
echo '</form>
    </body>
    </html>
    ';
?>