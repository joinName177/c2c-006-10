import type{SavedCase}from'../core/models';
import{migrateSavedCase}from'../core/migration';
import type{CaseRepository}from'../ports/case-repository.port';
const KEY='c2c-006.cases.v1';
export class LocalCaseRepository implements CaseRepository{
  constructor(private storage:Storage){}
  list(){
    try{
      const parsed=JSON.parse(this.storage.getItem(KEY)??'[]')as unknown[];
      return parsed.map(migrateSavedCase).filter((c):c is SavedCase=>Boolean(c));
    }catch{return[]}
  }
  save(value:SavedCase){
    const all=this.list().filter(c=>c.draft.id!==value.draft.id);
    all.unshift(value);
    this.storage.setItem(KEY,JSON.stringify(all));
  }
  delete(id:string){
    this.storage.setItem(KEY,JSON.stringify(this.list().filter(c=>c.draft.id!==id)));
  }
}
