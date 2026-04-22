# Template Parfait Import Plan V2

Ce format est celui lu nativement par `importPlanFromExcelArrayBuffer`.

## Format recommande

Fichier `.xlsx` avec 4 onglets:

1. `plan`
2. `templates`
3. `items`
4. `planned_sessions`

Un onglet optionnel `readme` peut etre ajoute.

## Colonnes canoniques

### Onglet `plan`

- `plan_name` (obligatoire)
- `plan_description` (optionnel)
- `version` (optionnel, entier >= 1)
- `payload_json` (optionnel, JSON objet)

### Onglet `templates`

- `template_name` (obligatoire)
- `description` (optionnel)
- `session_type` (optionnel)
- `priority` (optionnel)
- `lock_status` (optionnel)
- `block_primary_goal` (optionnel)
- `payload_json` (optionnel, JSON objet)

### Onglet `items`

- `template_name` (obligatoire)
- `position` (optionnel)
- `exercise_name` (obligatoire)
- `series` (optionnel)
- `reps` (optionnel)
- `load` (optionnel)
- `tempo` (optionnel)
- `rest` (optionnel)
- `rir` (optionnel)
- `coach_notes` (optionnel)
- `payload_json` (optionnel, JSON objet)

### Onglet `planned_sessions`

- `scheduled_for` (obligatoire)
- `template_name` (optionnel mais recommande)
- `block_primary_goal` (optionnel)
- `week_label` (optionnel)
- `day_label` (optionnel)
- `payload_json` (optionnel, JSON objet)

Dates acceptees: `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`.

## Exemple JSON equivalent

```json
{
  "plan": {
    "name": "Bloc Hybride S1",
    "description": "Template parfait V2 lu par Track'n'Perf"
  },
  "planVersion": {
    "version": 1,
    "payload": {
      "source": "excel_v2",
      "athlete_level": "intermediate",
      "objective": "hybrid_performance"
    }
  },
  "sessionTemplates": [
    {
      "name": "Force A",
      "template": {
        "source": "excel_v2",
        "sessionType": "strength",
        "priority": "high",
        "lockStatus": "adaptable",
        "blockPrimaryGoal": "strength",
        "items": [
          {
            "exercise": "Back Squat",
            "series": "4",
            "reps": "6",
            "load": "75%",
            "tempo": "2-0-1",
            "rest": "120",
            "rir": "2",
            "coachNotes": "Rythme controle"
          }
        ]
      }
    }
  ],
  "plannedSessions": [
    {
      "scheduledFor": "2026-05-12",
      "templateName": "Force A",
      "payload": {
        "block_primary_goal": "strength",
        "week_label": "S1",
        "day_label": "mardi"
      }
    }
  ]
}
```

## CSV minimal (planning uniquement)

```csv
plan_name,plan_description,version,scheduled_for,template_name,payload_json
Bloc Hybride S1,Exemple CSV,1,2026-05-12,Force A,"{""day_label"":""mardi""}"
Bloc Hybride S1,Exemple CSV,1,2026-05-13,Trail Z2,"{""day_label"":""mercredi""}"
```

