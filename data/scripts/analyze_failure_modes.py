import json

with open("data/claude_opus_ground_truth_2000.json", "r") as f:
    gt_data = json.load(f)
gt_map = {item["message_id"]: item.get("is_anomalous", False) for item in gt_data}

with open("data/mas_predictions.json", "r") as f:
    preds = json.load(f)

fn_count = 0
fm4_count = 0 # Suppressed Disagreement (False Negatives where difference < 0.3)
fm1_count = 0 # Information loss (Blinded Investigator 0.5)

for p in preds:
    mid = p["message_id"]
    is_threat = gt_map.get(mid, False)
    mas_anomalous = p.get("mas_prediction_is_anomalous", False)
    delib = p.get("deliberation_triggered", False)
    
    if is_threat and not mas_anomalous:
        fn_count += 1
        fm1_count += 1 # By definition, all suffered from Information Loss
        
        if not delib:
            fm4_count += 1

print(f"Total False Negatives: {fn_count}")
print(f"FM-1 Information Loss Cases: {fm1_count}")
print(f"FM-4 Suppressed Disagreement Cases: {fm4_count}")
print(f"Percentage of FNs caused by Suppressed Disagreement: {fm4_count/fn_count:.2%}")
