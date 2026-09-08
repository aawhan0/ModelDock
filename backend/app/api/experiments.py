from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.security import require_scope
from app.models.experiment import Dataset, Experiment, ExperimentRun
from app.models.model import ModelVersion
from app.schemas.experiment import (
    DatasetCreate,
    DatasetRead,
    ExperimentCreate,
    ExperimentRead,
    ExperimentRunCreate,
    ExperimentRunRead,
    ExperimentRunUpdate,
    ExperimentUpdate,
    LineageExperimentRead,
    LineageRunRead,
    ModelVersionLineageRead,
)

experiments_router = APIRouter(
    prefix="/experiments",
    tags=["experiments"],
    dependencies=[Depends(require_scope("experiments:manage"))],
)
datasets_router = APIRouter(
    prefix="/datasets",
    tags=["datasets"],
    dependencies=[Depends(require_scope("experiments:manage"))],
)
runs_router = APIRouter(
    prefix="/runs",
    tags=["experiment-runs"],
    dependencies=[Depends(require_scope("experiments:manage"))],
)


@datasets_router.post("", response_model=DatasetRead, status_code=status.HTTP_201_CREATED)
def create_dataset(payload: DatasetCreate, db: Session = Depends(get_db)) -> Dataset:
    dataset = Dataset(**payload.model_dump())
    db.add(dataset)
    try:
        db.commit()
        db.refresh(dataset)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Dataset name and version already exist") from exc
    return dataset


@datasets_router.get("", response_model=list[DatasetRead])
def list_datasets(db: Session = Depends(get_db)) -> list[Dataset]:
    return list(db.scalars(select(Dataset).order_by(Dataset.id.desc())).all())


@datasets_router.get("/{dataset_id}", response_model=DatasetRead)
def get_dataset(dataset_id: int, db: Session = Depends(get_db)) -> Dataset:
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@experiments_router.post("", response_model=ExperimentRead, status_code=status.HTTP_201_CREATED)
def create_experiment(payload: ExperimentCreate, db: Session = Depends(get_db)) -> Experiment:
    experiment = Experiment(**payload.model_dump())
    db.add(experiment)
    db.commit()
    db.refresh(experiment)
    return experiment


@experiments_router.get("", response_model=list[ExperimentRead])
def list_experiments(db: Session = Depends(get_db)) -> list[Experiment]:
    return list(db.scalars(select(Experiment).order_by(Experiment.id.desc())).all())


@experiments_router.get("/{experiment_id}", response_model=ExperimentRead)
def get_experiment(experiment_id: int, db: Session = Depends(get_db)) -> Experiment:
    experiment = db.get(Experiment, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


@experiments_router.patch("/{experiment_id}", response_model=ExperimentRead)
def update_experiment(
    experiment_id: int,
    payload: ExperimentUpdate,
    db: Session = Depends(get_db),
) -> Experiment:
    experiment = db.get(Experiment, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(experiment, field, value)
    db.commit()
    db.refresh(experiment)
    return experiment


@experiments_router.post(
    "/{experiment_id}/runs",
    response_model=ExperimentRunRead,
    status_code=status.HTTP_201_CREATED,
)
def create_experiment_run(
    experiment_id: int,
    payload: ExperimentRunCreate,
    db: Session = Depends(get_db),
) -> ExperimentRun:
    if db.get(Experiment, experiment_id) is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    _validate_run_references(db, payload.model_version_id, payload.dataset_id)

    run = ExperimentRun(experiment_id=experiment_id, **payload.model_dump())
    db.add(run)
    try:
        db.commit()
        db.refresh(run)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Experiment run name already exists") from exc
    return run


@experiments_router.get("/{experiment_id}/runs", response_model=list[ExperimentRunRead])
def list_experiment_runs(
    experiment_id: int,
    db: Session = Depends(get_db),
) -> list[ExperimentRun]:
    if db.get(Experiment, experiment_id) is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return list(
        db.scalars(
            select(ExperimentRun)
            .where(ExperimentRun.experiment_id == experiment_id)
            .order_by(ExperimentRun.id.desc())
        ).all()
    )


@runs_router.get("/{run_id}", response_model=ExperimentRunRead)
def get_experiment_run(run_id: int, db: Session = Depends(get_db)) -> ExperimentRun:
    run = db.get(ExperimentRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Experiment run not found")
    return run


@runs_router.patch("/{run_id}", response_model=ExperimentRunRead)
def update_experiment_run(
    run_id: int,
    payload: ExperimentRunUpdate,
    db: Session = Depends(get_db),
) -> ExperimentRun:
    run = db.get(ExperimentRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Experiment run not found")

    values = payload.model_dump(exclude_unset=True)
    _validate_run_references(db, values.get("model_version_id"), values.get("dataset_id"))
    for field, value in values.items():
        setattr(run, field, value)
    db.commit()
    db.refresh(run)
    return run


@experiments_router.get(
    "/lineage/model-versions/{model_id}/{version}",
    response_model=ModelVersionLineageRead,
)
def get_model_version_lineage(
    model_id: int,
    version: str,
    db: Session = Depends(get_db),
) -> ModelVersionLineageRead:
    model_version = (
        db.query(ModelVersion)
        .filter(ModelVersion.model_id == model_id, ModelVersion.version == version)
        .first()
    )
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")

    runs = list(
        db.scalars(
            select(ExperimentRun)
            .options(selectinload(ExperimentRun.dataset), selectinload(ExperimentRun.experiment))
            .where(ExperimentRun.model_version_id == model_version.id)
            .order_by(ExperimentRun.id.desc())
        ).all()
    )

    experiments: dict[int, LineageExperimentRead] = {}
    for run in runs:
        experiment = run.experiment
        if experiment.id not in experiments:
            experiments[experiment.id] = LineageExperimentRead(
                id=experiment.id,
                name=experiment.name,
                status=experiment.status,
                description=experiment.description,
                created_at=experiment.created_at,
                updated_at=experiment.updated_at,
                runs=[],
            )
        experiments[experiment.id].runs.append(
            LineageRunRead(
                id=run.id,
                experiment_id=run.experiment_id,
                model_version_id=run.model_version_id,
                dataset_id=run.dataset_id,
                name=run.name,
                status=run.status,
                parameters=run.parameters,
                metrics=run.metrics,
                started_at=run.started_at,
                completed_at=run.completed_at,
                created_at=run.created_at,
                dataset=run.dataset,
            )
        )

    return ModelVersionLineageRead(
        model_id=model_id,
        version=version,
        experiments=list(experiments.values()),
    )


def _validate_run_references(
    db: Session,
    model_version_id: int | None,
    dataset_id: int | None,
) -> None:
    if model_version_id is not None and db.get(ModelVersion, model_version_id) is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    if dataset_id is not None and db.get(Dataset, dataset_id) is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
