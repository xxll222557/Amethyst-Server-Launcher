use launcher_data::list_instances;
use launcher_launch::app::ProcessState;
use std::fs;
use std::path::Path;

pub fn export_diagnostics_report(
    process_state: &ProcessState,
    base_dir: &Path,
    diagnostics_payload: Option<String>,
) -> Result<String, String> {
    let instances = list_instances(base_dir)?;

    let diagnostics_dir = base_dir.join("diagnostics");
    fs::create_dir_all(&diagnostics_dir)
        .map_err(|err| format!("failed to create diagnostics dir: {err}"))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default();
    let report_path = diagnostics_dir.join(format!("diagnostics-{timestamp}.log"));

    let mut report = String::new();
    report.push_str("Amethyst Server Launcher Diagnostics\n");
    report.push_str(&format!("GeneratedAtUnix={timestamp}\n"));
    report.push_str(&format!("DataDir={}\n\n", base_dir.display()));

    report.push_str("[Instances]\n");
    for instance in &instances {
        report.push_str(&format!(
            "- {} | id={} | type={} | version={} | coreDownloaded={} | dir={}\n",
            instance.name,
            instance.id,
            instance.server_type,
            instance.version,
            instance.core_downloaded,
            instance.directory
        ));
    }

    report.push_str("\n[RunningProcesses]\n");
    {
        let map = process_state
            .processes
            .lock()
            .map_err(|_| "failed to lock process state".to_string())?;
        if map.is_empty() {
            report.push_str("- none\n");
        } else {
            for instance_id in map.keys() {
                report.push_str(&format!("- {instance_id}\n"));
            }
        }
    }

    report.push_str("\n[RecentConsoleLogs]\n");
    {
        let logs = process_state
            .logs
            .lock()
            .map_err(|_| "failed to lock console logs".to_string())?;
        if logs.is_empty() {
            report.push_str("- none\n");
        } else {
            for (instance_id, lines) in logs.iter() {
                report.push_str(&format!("## {instance_id}\n"));
                let len = lines.len();
                let start = len.saturating_sub(80);
                for line in lines.iter().skip(start) {
                    report.push_str(line);
                    report.push('\n');
                }
                report.push('\n');
            }
        }
    }

    report.push_str("\n[FrontendDiagnostics]\n");
    if let Some(payload) = diagnostics_payload {
        match serde_json::from_str::<serde_json::Value>(&payload) {
            Ok(value) => {
                let pretty = serde_json::to_string_pretty(&value)
                    .map_err(|err| format!("failed to serialize frontend diagnostics: {err}"))?;
                report.push_str(&pretty);
                report.push('\n');
            }
            Err(_) => {
                report.push_str("(raw)\n");
                report.push_str(&payload);
                report.push('\n');
            }
        }
    } else {
        report.push_str("- none\n");
    }

    fs::write(&report_path, report).map_err(|err| format!("failed to write diagnostics report: {err}"))?;

    Ok(report_path.to_string_lossy().to_string())
}
