from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
import json
import logging
from datetime import timezone,  datetime, timedelta
from uuid import uuid4
from typing import Optional

from kv_client import kv_get_json, kv_set_json, kv_delete
from blob_client import upload_file
from models import ProgramCreate, ProgramUpdate, ReminderCreate
from routers.admin_auth import get_current_admin
from routers.auth_users import get_current_user

logger = logging.getLogger('tv-backend')

router = APIRouter(prefix='/api', tags=['EPG'])


async def _get_programs(channel_id: Optional[str] = None) -> list:
    if channel_id:
        data = await kv_get_json(f'epg:{channel_id}')
    else:
        data = await kv_get_json('epg:all')
    if data is None:
        return []
    return data


async def _save_programs(channel_id: str, programs: list):
    await kv_set_json(f'epg:{channel_id}', programs, ex=86400 * 7)
    all_programs = await kv_get_json('epg:all') or {}
    all_programs[channel_id] = programs
    await kv_set_json('epg:all', all_programs, ex=86400 * 7)


def _generate_recurring_instances(program: dict, days_ahead: int = 7) -> list:
    instances = []
    recurring = program.get('recurring')
    if not recurring:
        instances.append(program)
        return instances

    try:
        start = datetime.fromisoformat(program['start_datetime'])
        end = datetime.fromisoformat(program['end_datetime'])
    except (ValueError, KeyError):
        instances.append(program)
        return instances

    duration = end - start
    instances.append(program)

    if recurring == 'daily':
        for day in range(1, days_ahead + 1):
            new_start = start + timedelta(days=day)
            new_end = new_start + duration
            inst = dict(program)
            inst['id'] = str(uuid4())
            inst['start_datetime'] = new_start.isoformat()
            inst['end_datetime'] = new_end.isoformat()
            inst['recurring_instance'] = True
            instances.append(inst)
    elif recurring == 'weekly':
        target_day = program.get('recurring_day')
        if target_day:
            days_map = {'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3, 'friday': 4, 'saturday': 5, 'sunday': 6}
            target = days_map.get(target_day.lower())
            if target is not None:
                for week in range(1, 4):
                    for d in range(7):
                        check = start + timedelta(days=week * 7 + d)
                        if check.weekday() == target:
                            new_start = check.replace(hour=start.hour, minute=start.minute, second=0)
                            new_end = new_start + duration
                            inst = dict(program)
                            inst['id'] = str(uuid4())
                            inst['start_datetime'] = new_start.isoformat()
                            inst['end_datetime'] = new_end.isoformat()
                            inst['recurring_instance'] = True
                            instances.append(inst)
                            break

    instances.sort(key=lambda p: p.get('start_datetime', ''))
    return instances


@router.get('/admin/epg/{channel_id}')
async def admin_get_programs(channel_id: str, current_user: dict = Depends(get_current_admin)):
    programs = await _get_programs(channel_id)
    return JSONResponse(programs)


@router.post('/admin/epg/{channel_id}')
async def admin_create_program(channel_id: str, body: ProgramCreate, current_user: dict = Depends(get_current_admin)):
    program = {
        'id': str(uuid4()),
        'channel_id': channel_id,
        'title': body.title.strip(),
        'description': body.description or '',
        'start_datetime': body.start_datetime,
        'end_datetime': body.end_datetime,
        'episode_number': body.episode_number,
        'genre': body.genre,
        'is_mature': body.is_mature,
        'recurring': body.recurring,
        'recurring_day': body.recurring_day,
        'recurring_time': body.recurring_time,
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    programs = await _get_programs(channel_id)
    programs.append(program)
    await _save_programs(channel_id, programs)
    return JSONResponse(program, status_code=201)


@router.put('/admin/epg/{channel_id}/{program_id}')
async def admin_update_program(channel_id: str, program_id: str, body: ProgramUpdate, current_user: dict = Depends(get_current_admin)):
    programs = await _get_programs(channel_id)
    idx = None
    for i, p in enumerate(programs):
        if p.get('id') == program_id:
            idx = i
            break
    if idx is None:
        raise HTTPException(status_code=404, detail='Program not found')

    prog = programs[idx]
    update_map = body.model_dump(exclude_none=True)
    for key, val in update_map.items():
        if val is not None:
            prog[key] = val
    programs[idx] = prog
    await _save_programs(channel_id, programs)
    return JSONResponse(prog)


@router.delete('/admin/epg/{channel_id}/{program_id}')
async def admin_delete_program(channel_id: str, program_id: str, current_user: dict = Depends(get_current_admin)):
    programs = await _get_programs(channel_id)
    programs = [p for p in programs if p.get('id') != program_id]
    await _save_programs(channel_id, programs)
    return JSONResponse({'success': True})


@router.get('/epg/now')
async def get_now_playing():
    all_programs = await kv_get_json('epg:all') or {}
    now = datetime.now(timezone.utc)
    results = []
    for channel_id, programs in all_programs.items():
        expanded = []
        for p in programs:
            expanded.extend(_generate_recurring_instances(p))
        for p in expanded:
            try:
                start = datetime.fromisoformat(p['start_datetime'])
                end = datetime.fromisoformat(p['end_datetime'])
            except (ValueError, KeyError):
                continue
            if start <= now < end:
                p['channel_id'] = channel_id
                p['remaining_seconds'] = int((end - now).total_seconds())
                results.append(p)
                break
    return JSONResponse(results)


@router.get('/epg/upnext')
async def get_up_next():
    all_programs = await kv_get_json('epg:all') or {}
    now = datetime.now(timezone.utc)
    results = []
    for channel_id, programs in all_programs.items():
        expanded = []
        for p in programs:
            expanded.extend(_generate_recurring_instances(p))
        for p in sorted(expanded, key=lambda x: x.get('start_datetime', '')):
            try:
                start = datetime.fromisoformat(p['start_datetime'])
            except (ValueError, KeyError):
                continue
            if start > now:
                p['channel_id'] = channel_id
                p['starts_in_seconds'] = int((start - now).total_seconds())
                results.append(p)
                break
    return JSONResponse(results)


@router.get('/epg/grid')
async def get_epg_grid(date: Optional[str] = None):
    all_programs = await kv_get_json('epg:all') or {}
    if not date:
        date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    results = {}
    for channel_id, programs in all_programs.items():
        channel_progs = []
        for p in programs:
            expanded = _generate_recurring_instances(p)
            for inst in expanded:
                try:
                    s = datetime.fromisoformat(inst['start_datetime'])
                    if s.strftime('%Y-%m-%d') == date:
                        channel_progs.append(inst)
                except (ValueError, KeyError):
                    continue
        if channel_progs:
            results[channel_id] = channel_progs
    return JSONResponse(results)


@router.post('/epg/reminder')
async def set_reminder(body: ReminderCreate, request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    reminders = await kv_get_json(f'reminders:{username}') or []
    if body.program_id not in reminders:
        reminders.append(body.program_id)
        await kv_set_json(f'reminders:{username}', reminders, ex=86400 * 30)
    return JSONResponse({'success': True})


@router.delete('/epg/reminder/{program_id}')
async def remove_reminder(program_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    reminders = await kv_get_json(f'reminders:{username}') or []
    reminders = [r for r in reminders if r != program_id]
    await kv_set_json(f'reminders:{username}', reminders, ex=86400 * 30)
    return JSONResponse({'success': True})


@router.get('/epg/reminders')
async def get_reminders(request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    reminders = await kv_get_json(f'reminders:{username}') or []
    return JSONResponse(reminders)


@router.post('/admin/epg/{channel_id}/{program_id}/subtitles')
async def upload_subtitles(channel_id: str, program_id: str, request: Request, current_user: dict = Depends(get_current_admin)):
    form = await request.form()
    file = form.get('file')
    if not file:
        raise HTTPException(status_code=400, detail='No file uploaded')
    content = await file.read()
    ext = file.filename.rsplit('.', 1)[-1] if '.' in file.filename else 'vtt'
    filename = f'subtitles/{channel_id}/{program_id}.{ext}'
    try:
        url = await upload_file(content, filename, 'text/vtt')
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    programs = await _get_programs(channel_id)
    for p in programs:
        if p.get('id') == program_id:
            p['subtitle_url'] = url
            break
    await _save_programs(channel_id, programs)
    return JSONResponse({'url': url, 'program_id': program_id})
