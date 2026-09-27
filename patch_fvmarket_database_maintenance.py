from pathlib import Path
import base64
import io
import re
import tarfile


ROOT = Path('appsrc')
SERVER = ROOT / 'server.js'
INDEX = ROOT / 'public' / 'index.html'
ADMIN = ROOT / 'public' / 'admin.html'
TESTS = ROOT / 'test' / 'core.test.js'

FILES_B64 = {
    ROOT / 'persistent_store_v17.js': 'Ly8gRlZNX1BFUlNJU1RFTkNFX1YxNwpjb25zdCBmcz1yZXF1aXJlKCdmcycpOwpsZXQgUG9vbD1udWxsO3RyeXsoe1Bvb2x9PXJlcXVpcmUoJ3BnJykpfWNhdGNoe30KbGV0IHBvb2w9bnVsbCxkYXRhRmlsZT0nJyxlbmFibGVkPWZhbHNlLGxhc3RFcnJvcj0nJyx0aW1lcj1udWxsLHBlbmRpbmc9bnVsbCx3cml0ZVF1ZXVlPVByb21pc2UucmVzb2x2ZSgpOwoKZnVuY3Rpb24gZGJVcmwoKXtyZXR1cm4gU3RyaW5nKHByb2Nlc3MuZW52LkRBVEFCQVNFX1VSTHx8cHJvY2Vzcy5lbnYuUE9TVEdSRVNfVVJMfHxwcm9jZXNzLmVudi5SRU5ERVJfUE9TVEdSRVNfVVJMfHwnJykudHJpbSgpfQpmdW5jdGlvbiBjb25maWcoZmlsZSl7ZGF0YUZpbGU9ZmlsZX0KYXN5bmMgZnVuY3Rpb24gaW5pdCgpewogIGNvbnN0IHVybD1kYlVybCgpOwogIGlmKCF1cmx8fCFQb29sKXsKICAgIGVuYWJsZWQ9ZmFsc2U7bGFzdEVycm9yPXVybD8nTcOzZHVsbyBwZyBubyBkaXNwb25pYmxlJzonREFUQUJBU0VfVVJMIG5vIGNvbmZpZ3VyYWRhJzsKICAgIGNvbnNvbGUubG9nKCdGVk1hcmtldCBwZXJzaXN0ZW5jZTogZmlsZSBmYWxsYmFjayDCtyAnK2xhc3RFcnJvcik7CiAgICByZXR1cm4ge2VuYWJsZWQ6ZmFsc2UsbW9kZTonZmlsZScscmVhc29uOmxhc3RFcnJvcn07CiAgfQogIHRyeXsKICAgIHBvb2w9bmV3IFBvb2woe2Nvbm5lY3Rpb25TdHJpbmc6dXJsLHNzbDp7cmVqZWN0VW5hdXRob3JpemVkOmZhbHNlfSxtYXg6MyxpZGxlVGltZW91dE1pbGxpczoxNTAwMCxjb25uZWN0aW9uVGltZW91dE1pbGxpczoxMjAwMH0pOwogICAgYXdhaXQgcG9vbC5xdWVyeShgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgZnZtYXJrZXRfc3RhdGUgKHN0YXRlX2tleSBURVhUIFBSSU1BUlkgS0VZLCBwYXlsb2FkIFRFWFQgTk9UIE5VTEwsIHVwZGF0ZWRfYXQgVElNRVNUQU1QVFogTk9UIE5VTEwgREVGQVVMVCBOT1coKSlgKTsKICAgIGNvbnN0IHE9YXdhaXQgcG9vbC5xdWVyeShgU0VMRUNUIHBheWxvYWQgRlJPTSBmdm1hcmtldF9zdGF0ZSBXSEVSRSBzdGF0ZV9rZXk9J21haW4nIExJTUlUIDFgKTsKICAgIGlmKHEucm93cy5sZW5ndGgpewogICAgICBjb25zdCByYXc9U3RyaW5nKHEucm93c1swXS5wYXlsb2FkfHwnJyk7SlNPTi5wYXJzZShyYXcpO2ZzLndyaXRlRmlsZVN5bmMoZGF0YUZpbGUscmF3KTtjb25zb2xlLmxvZygnRlZNYXJrZXQgcGVyc2lzdGVuY2U6IHJlc3RvcmVkIHN0YXRlIGZyb20gUG9zdGdyZXMnKTsKICAgIH1lbHNlIGlmKGZzLmV4aXN0c1N5bmMoZGF0YUZpbGUpKXsKICAgICAgY29uc3QgcmF3PWZzLnJlYWRGaWxlU3luYyhkYXRhRmlsZSwndXRmOCcpO0pTT04ucGFyc2UocmF3KTthd2FpdCBwb29sLnF1ZXJ5KGBJTlNFUlQgSU5UTyBmdm1hcmtldF9zdGF0ZShzdGF0ZV9rZXkscGF5bG9hZCx1cGRhdGVkX2F0KSBWQUxVRVMoJ21haW4nLCQxLE5PVygpKSBPTiBDT05GTElDVChzdGF0ZV9rZXkpIERPIFVQREFURSBTRVQgcGF5bG9hZD1FWENMVURFRC5wYXlsb2FkLHVwZGF0ZWRfYXQ9Tk9XKClgLFtyYXddKTtjb25zb2xlLmxvZygnRlZNYXJrZXQgcGVyc2lzdGVuY2U6IGluaXRpYWwgc3RhdGUgY29waWVkIHRvIFBvc3RncmVzJyk7CiAgICB9CiAgICBlbmFibGVkPXRydWU7bGFzdEVycm9yPScnO2NvbnNvbGUubG9nKCdGVk1hcmtldCBwZXJzaXN0ZW5jZTogUG9zdGdyZXMgZW5hYmxlZCcpO3JldHVybiB7ZW5hYmxlZDp0cnVlLG1vZGU6J3Bvc3RncmVzJ307CiAgfWNhdGNoKGUpe2VuYWJsZWQ9ZmFsc2U7bGFzdEVycm9yPVN0cmluZyhlLm1lc3NhZ2V8fGUpO2NvbnNvbGUuZXJyb3IoJ0ZWTWFya2V0IHBlcnNpc3RlbmNlOiBQb3N0Z3JlcyB1bmF2YWlsYWJsZSDCtyAnK2xhc3RFcnJvcik7dHJ5e2F3YWl0IHBvb2w/LmVuZCgpfWNhdGNoe31wb29sPW51bGw7cmV0dXJuIHtlbmFibGVkOmZhbHNlLG1vZGU6J2ZpbGUnLHJlYXNvbjpsYXN0RXJyb3J9fQp9CmZ1bmN0aW9uIHdyaXRlUmF3KHJhdyl7Y29uc3Qgam9iPXdyaXRlUXVldWUudGhlbigoKT0+cG9vbC5xdWVyeShgSU5TRVJUIElOVE8gZnZtYXJrZXRfc3RhdGUoc3RhdGVfa2V5LHBheWxvYWQsdXBkYXRlZF9hdCkgVkFMVUVTKCdtYWluJywkMSxOT1coKSkgT04gQ09ORkxJQ1Qoc3RhdGVfa2V5KSBETyBVUERBVEUgU0VUIHBheWxvYWQ9RVhDTFVERUQucGF5bG9hZCx1cGRhdGVkX2F0PU5PVygpYCxbcmF3XSkpO3dyaXRlUXVldWU9am9iLmNhdGNoKCgpPT57fSk7cmV0dXJuIGpvYn0KYXN5bmMgZnVuY3Rpb24gZmx1c2goKXsKICB0aW1lcj1udWxsO2lmKCFlbmFibGVkfHwhcG9vbHx8cGVuZGluZz09bnVsbClyZXR1cm47Y29uc3QgcmF3PXBlbmRpbmc7cGVuZGluZz1udWxsOwogIHRyeXthd2FpdCB3cml0ZVJhdyhyYXcpO2xhc3RFcnJvcj0nJ31jYXRjaChlKXtsYXN0RXJyb3I9U3RyaW5nKGUubWVzc2FnZXx8ZSk7Y29uc29sZS5lcnJvcignRlZNYXJrZXQgcGVyc2lzdGVuY2Ugd3JpdGUgZmFpbGVkOicsbGFzdEVycm9yKX0KICBpZihwZW5kaW5nIT1udWxsKXNjaGVkdWxlUmF3KHBlbmRpbmcpOwp9CmZ1bmN0aW9uIHNjaGVkdWxlUmF3KHJhdyl7cGVuZGluZz1yYXc7aWYodGltZXIpY2xlYXJUaW1lb3V0KHRpbWVyKTt0aW1lcj1zZXRUaW1lb3V0KGZsdXNoLDE4MCl9CmZ1bmN0aW9uIHBlcnNpc3QoZGF0YSl7aWYoIWVuYWJsZWQpcmV0dXJuO3RyeXtzY2hlZHVsZVJhdyhKU09OLnN0cmluZ2lmeShkYXRhLG51bGwsMikpfWNhdGNoKGUpe2xhc3RFcnJvcj1TdHJpbmcoZS5tZXNzYWdlfHxlKX19CmFzeW5jIGZ1bmN0aW9uIHJlcGxhY2UocmF3KXsKICBjb25zdCBwYXlsb2FkPXR5cGVvZiByYXc9PT0nc3RyaW5nJz9yYXc6SlNPTi5zdHJpbmdpZnkocmF3LG51bGwsMik7CiAgaWYodGltZXIpe2NsZWFyVGltZW91dCh0aW1lcik7dGltZXI9bnVsbH1wZW5kaW5nPW51bGw7CiAgaWYoIWVuYWJsZWR8fCFwb29sKXJldHVybiB7ZW5hYmxlZDpmYWxzZSxtb2RlOidmaWxlJ307CiAgdHJ5e2F3YWl0IHdyaXRlUmF3KHBheWxvYWQpO2xhc3RFcnJvcj0nJztyZXR1cm4ge2VuYWJsZWQ6dHJ1ZSxtb2RlOidwb3N0Z3Jlcyd9fQogIGNhdGNoKGUpe2xhc3RFcnJvcj1TdHJpbmcoZS5tZXNzYWdlfHxlKTtjb25zb2xlLmVycm9yKCdGVk1hcmtldCBwZXJzaXN0ZW5jZSByZXBsYWNlbWVudCBmYWlsZWQ6JyxsYXN0RXJyb3IpO3Rocm93IG5ldyBFcnJvcignTm8gc2UgcHVkbyBndWFyZGFyIGVsIGNhbWJpbyBjb21wbGV0byBlbiBQb3N0Z3Jlcy4nKTt9Cn0KZnVuY3Rpb24gc3RhdHVzKCl7cmV0dXJuIHtlbmFibGVkLG1vZGU6ZW5hYmxlZD8ncG9zdGdyZXMnOidmaWxlJyxkYXRhRmlsZSxsYXN0RXJyb3J9fQptb2R1bGUuZXhwb3J0cz17Y29uZmlnLGluaXQscGVyc2lzdCxyZXBsYWNlLHN0YXR1c307Cg==',
    ROOT / 'database_backup_v1.js': 'J3VzZSBzdHJpY3QnOwoKY29uc3QgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJyk7Cgpjb25zdCBGT1JNQVQgPSAnRlZNYXJrZXQgZGF0YWJhc2UgYmFja3VwJzsKY29uc3QgVkVSU0lPTiA9IDE7CgpmdW5jdGlvbiBwbGFpbk9iamVjdCh2YWx1ZSkgewogIHJldHVybiAhIXZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpOwp9CgpmdW5jdGlvbiBjbG9uZSh2YWx1ZSkgewogIHJldHVybiBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHZhbHVlKSk7Cn0KCmZ1bmN0aW9uIGNoZWNrc3VtKGRhdGEpIHsKICByZXR1cm4gY3J5cHRvLmNyZWF0ZUhhc2goJ3NoYTI1NicpLnVwZGF0ZShKU09OLnN0cmluZ2lmeShkYXRhKSkuZGlnZXN0KCdoZXgnKTsKfQoKZnVuY3Rpb24gY3JlYXRlQmFja3VwKGRhdGEsIGV4cG9ydGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkpIHsKICBjb25zdCBzdGF0ZSA9IGNsb25lKGRhdGEpOwogIHJldHVybiB7IGZvcm1hdDogRk9STUFULCB2ZXJzaW9uOiBWRVJTSU9OLCBleHBvcnRlZEF0LCBjaGVja3N1bTogY2hlY2tzdW0oc3RhdGUpLCBkYXRhOiBzdGF0ZSB9Owp9CgpmdW5jdGlvbiBwYXJzZUJhY2t1cChwYXlsb2FkKSB7CiAgY29uc3QgYmFja3VwID0gcGF5bG9hZD8uYmFja3VwIHx8IHBheWxvYWQ7CiAgaWYgKCFwbGFpbk9iamVjdChiYWNrdXApIHx8IGJhY2t1cC5mb3JtYXQgIT09IEZPUk1BVCB8fCBOdW1iZXIoYmFja3VwLnZlcnNpb24pICE9PSBWRVJTSU9OIHx8ICFwbGFpbk9iamVjdChiYWNrdXAuZGF0YSkpIHsKICAgIHRocm93IG5ldyBFcnJvcignRWwgYXJjaGl2byBubyBlcyB1bmEgY29waWEgdsOhbGlkYSBkZSBGVk1hcmtldC4nKTsKICB9CiAgaWYgKHR5cGVvZiBiYWNrdXAuY2hlY2tzdW0gIT09ICdzdHJpbmcnIHx8ICEvXlthLWYwLTldezY0fSQvaS50ZXN0KGJhY2t1cC5jaGVja3N1bSkgfHwgY2hlY2tzdW0oYmFja3VwLmRhdGEpICE9PSBiYWNrdXAuY2hlY2tzdW0pIHsKICAgIHRocm93IG5ldyBFcnJvcignTGEgY29tcHJvYmFjacOzbiBkZSBpbnRlZ3JpZGFkIGRlIGxhIGNvcGlhIG5vIGVzIHbDoWxpZGEuJyk7CiAgfQogIGNvbnN0IHN0YXRlID0gY2xvbmUoYmFja3VwLmRhdGEpOwogIGZvciAoY29uc3Qga2V5IG9mIFsndXNlcnMnLCAncHJvZHVjdHMnLCAnb3JkZXJzJywgJ3F1b3RlcyddKSB7CiAgICBpZiAoIUFycmF5LmlzQXJyYXkoc3RhdGVba2V5XSkpIHRocm93IG5ldyBFcnJvcignTGEgY29waWEgbm8gY29udGllbmUgdW5hIGVzdHJ1Y3R1cmEgZGUgZGF0b3MgY29tcGxldGEuJyk7CiAgfQogIGlmICghcGxhaW5PYmplY3Qoc3RhdGUuc2V0dGluZ3MpKSB0aHJvdyBuZXcgRXJyb3IoJ0xhIGNvcGlhIG5vIGNvbnRpZW5lIGxhIGNvbmZpZ3VyYWNpw7NuIGRlIEZWTWFya2V0LicpOwogIHJldHVybiBzdGF0ZTsKfQoKZnVuY3Rpb24gcHJlc2VydmVBZG1pbmlzdHJhdG9ycyhzdGF0ZSwgY3VycmVudFVzZXJzID0gW10pIHsKICBjb25zdCBuZXh0ID0gY2xvbmUoc3RhdGUpOwogIG5leHQudXNlcnMgPSBBcnJheS5pc0FycmF5KG5leHQudXNlcnMpID8gbmV4dC51c2VycyA6IFtdOwogIGZvciAoY29uc3QgYWRtaW4gb2YgY3VycmVudFVzZXJzLmZpbHRlcih1c2VyID0+IHVzZXI/LnJvbGUgPT09ICdhZG1pbicgJiYgdXNlci5pZCkpIHsKICAgIGNvbnN0IGluZGV4ID0gbmV4dC51c2Vycy5maW5kSW5kZXgodXNlciA9PiB1c2VyPy5pZCA9PT0gYWRtaW4uaWQpOwogICAgaWYgKGluZGV4ID49IDApIG5leHQudXNlcnNbaW5kZXhdID0geyAuLi5uZXh0LnVzZXJzW2luZGV4XSwgLi4uY2xvbmUoYWRtaW4pLCByb2xlOiAnYWRtaW4nIH07CiAgICBlbHNlIG5leHQudXNlcnMudW5zaGlmdChjbG9uZShhZG1pbikpOwogIH0KICByZXR1cm4gbmV4dDsKfQoKZnVuY3Rpb24gaW5pdGlhbFN0YXRlKHNlZWRTdGF0ZSwgY3VycmVudFVzZXJzID0gW10pIHsKICBjb25zdCBuZXh0ID0gY2xvbmUoc2VlZFN0YXRlKTsKICBuZXh0LnVzZXJzID0gY3VycmVudFVzZXJzLmZpbHRlcih1c2VyID0+IHVzZXI/LnJvbGUgPT09ICdhZG1pbicgJiYgdXNlci5pZCkubWFwKGNsb25lKTsKICByZXR1cm4gbmV4dDsKfQoKbW9kdWxlLmV4cG9ydHMgPSB7IEZPUk1BVCwgVkVSU0lPTiwgY3JlYXRlQmFja3VwLCBwYXJzZUJhY2t1cCwgcHJlc2VydmVBZG1pbmlzdHJhdG9ycywgaW5pdGlhbFN0YXRlIH07Cg==',
    ROOT / 'public' / 'fvmarket-admin-database-v1.js': 'KCgpPT57CiAgJ3VzZSBzdHJpY3QnOwogIGNvbnN0IE1BWF9CWVRFUz0yNSoxMDI0KjEwMjQ7CiAgbGV0IHNlbGVjdGVkQmFja3VwPW51bGw7CiAgY29uc3Qgc3RhdHVzVGV4dD0obm9kZSx0ZXh0LGtpbmQ9JycpPT57bm9kZS50ZXh0Q29udGVudD10ZXh0O25vZGUuY2xhc3NOYW1lPSdtc2cgJytraW5kfTsKICBjb25zdCB0b2tlbj0oKT0+c2Vzc2lvbj8udG9rZW58fCcnOwogIGNvbnN0IG1vdW50PSgpPT57CiAgICBjb25zdCBzZXR0aW5ncz1kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjdmlldy1zZXR0aW5ncyAuY2FyZCcpOwogICAgaWYoIXNldHRpbmdzfHxkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZnZtRGF0YWJhc2VUb29scycpKXJldHVybjsKICAgIGNvbnN0IGNhcmQ9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2VjdGlvbicpO2NhcmQuaWQ9J2Z2bURhdGFiYXNlVG9vbHMnO2NhcmQuY2xhc3NOYW1lPSdjYXJkJzsKICAgIGNhcmQuaW5uZXJIVE1MPWA8ZGl2IGNsYXNzPSJmdm1EYkhlYWQiPjxkaXY+PGgyPkNvcGlhcyB5IG1hbnRlbmltaWVudG88L2gyPjxwIGNsYXNzPSJzdWIiPkRlc2NhcmdhIHVuYSBjb3BpYSBjb21wbGV0YSwgcmVzdMOhdXJhbGEgY3VhbmRvIHNlYSBuZWNlc2FyaW8gbyByZWluaWNpYSBsb3MgZGF0b3Mgb3BlcmF0aXZvcy48L3A+PC9kaXY+PHNwYW4gY2xhc3M9ImJhZGdlIiBpZD0iZnZtRGJQZXJzaXN0ZW5jZSI+Q29tcHJvYmFuZG8gYWxtYWNlbmFtaWVudG/igKY8L3NwYW4+PC9kaXY+PGRpdiBjbGFzcz0iZnZtRGJBY3Rpb25zIj48YnV0dG9uIGNsYXNzPSJidG4gbmF2eSIgdHlwZT0iYnV0dG9uIiBpZD0iZnZtRGJFeHBvcnQiPkRlc2NhcmdhciBjb3BpYTwvYnV0dG9uPjxsYWJlbCBjbGFzcz0iYnRuIGdob3N0IiBmb3I9ImZ2bURiRmlsZSI+RWxlZ2lyIGNvcGlhIEpTT048L2xhYmVsPjxpbnB1dCBpZD0iZnZtRGJGaWxlIiB0eXBlPSJmaWxlIiBhY2NlcHQ9ImFwcGxpY2F0aW9uL2pzb24sLmpzb24iIGhpZGRlbj48YnV0dG9uIGNsYXNzPSJidG4gZ2hvc3QiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZ2bURiSW1wb3J0IiBkaXNhYmxlZD5JbXBvcnRhciBjb3BpYTwvYnV0dG9uPjwvZGl2PjxkaXYgY2xhc3M9Im5vdGljZSI+PGI+SW1wb3J0YXIgc3VzdGl0dXllIGxvcyBkYXRvcyBhY3R1YWxlczwvYj4gcG9yIGxvcyBkZSBsYSBjb3BpYSAocGVkaWRvcywgY2F0w6Fsb2dvLCBjbGllbnRlcywgZmFjdHVyYXMgeSBjb25maWd1cmFjacOzbikuIExhcyBjdWVudGFzIGFkbWluaXN0cmFkb3JhcyBxdWUgeWEgZXhpc3RlbiBzZSBtYW50aWVuZW4gcGFyYSBxdWUgbm8gcGllcmRhcyBlbCBhY2Nlc28uPC9kaXY+PHAgaWQ9ImZ2bURiTWVzc2FnZSIgY2xhc3M9Im1zZyIgYXJpYS1saXZlPSJwb2xpdGUiPjwvcD48ZGl2IGNsYXNzPSJmdm1EYkRhbmdlciI+PGgzPlpvbmEgZGUgcmllc2dvPC9oMz48cD5SZWluaWNpYSBGVk1hcmtldCBhIHN1IGVzdGFkbyBpbmljaWFsLiBFbGltaW5hIGxvcyBkYXRvcyBvcGVyYXRpdm9zIHkgcmVzdGF1cmEgZWwgY2F0w6Fsb2dvIGJhc2U7IGxhcyBjdWVudGFzIGFkbWluaXN0cmFkb3JhcyBzZSBjb25zZXJ2YW4uPC9wPjxidXR0b24gY2xhc3M9ImJ0biBkYW5nZXIiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZ2bURiUmVzZXQiPlJlaW5pY2lhciBiYXNlIGRlIGRhdG9zPC9idXR0b24+PC9kaXY+YDsKICAgIHNldHRpbmdzLmluc2VydEFkamFjZW50RWxlbWVudCgnYWZ0ZXJlbmQnLGNhcmQpOwogICAgY29uc3QgbWVzc2FnZT1jYXJkLnF1ZXJ5U2VsZWN0b3IoJyNmdm1EYk1lc3NhZ2UnKSxpbXBvcnRCdXR0b249Y2FyZC5xdWVyeVNlbGVjdG9yKCcjZnZtRGJJbXBvcnQnKSxmaWxlSW5wdXQ9Y2FyZC5xdWVyeVNlbGVjdG9yKCcjZnZtRGJGaWxlJyk7CiAgICBjb25zdCBnZXRTdGF0dXM9YXN5bmMoKT0+e3RyeXtjb25zdCBkYXRhPWF3YWl0IGFwaSgnL2FwaS9hZG1pbi9wZXJzaXN0ZW5jZS1zdGF0dXMnKTtjb25zdCBsYWJlbD1kYXRhLm1vZGU9PT0ncG9zdGdyZXMnPydQb3N0Z3JlU1FMIGFjdGl2byc6J0FyY2hpdm8gbG9jYWwnO2NvbnN0IGJhZGdlPWNhcmQucXVlcnlTZWxlY3RvcignI2Z2bURiUGVyc2lzdGVuY2UnKTtiYWRnZS50ZXh0Q29udGVudD1sYWJlbDtiYWRnZS50aXRsZT1kYXRhLmxhc3RFcnJvcnx8Jyd9Y2F0Y2h7Y2FyZC5xdWVyeVNlbGVjdG9yKCcjZnZtRGJQZXJzaXN0ZW5jZScpLnRleHRDb250ZW50PSdBbG1hY2VuYW1pZW50byBubyBkaXNwb25pYmxlJ319OwogICAgY2FyZC5xdWVyeVNlbGVjdG9yKCcjZnZtRGJFeHBvcnQnKS5vbmNsaWNrPWFzeW5jKCk9Pnt0cnl7c3RhdHVzVGV4dChtZXNzYWdlLCdQcmVwYXJhbmRvIGxhIGNvcGlh4oCmJyk7Y29uc3QgcmVzcG9uc2U9YXdhaXQgZmV0Y2goJy9hcGkvYWRtaW4vZGF0YWJhc2UvZXhwb3J0Jyx7aGVhZGVyczp7QXV0aG9yaXphdGlvbjonQmVhcmVyICcrdG9rZW4oKX19KTtpZighcmVzcG9uc2Uub2spe2xldCBkYXRhPXt9O3RyeXtkYXRhPWF3YWl0IHJlc3BvbnNlLmpzb24oKX1jYXRjaHt9dGhyb3cgRXJyb3IoZGF0YS5lcnJvcnx8J05vIHNlIHB1ZG8gZXhwb3J0YXIgbGEgY29waWEuJyl9Y29uc3QgYmxvYj1hd2FpdCByZXNwb25zZS5ibG9iKCksdXJsPVVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYiksbGluaz1kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7bGluay5ocmVmPXVybDtsaW5rLmRvd25sb2FkPSdmdm1hcmtldC1iYWNrdXAuanNvbic7ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChsaW5rKTtsaW5rLmNsaWNrKCk7bGluay5yZW1vdmUoKTtVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7c3RhdHVzVGV4dChtZXNzYWdlLCdDb3BpYSBkZXNjYXJnYWRhIGNvcnJlY3RhbWVudGUuJywnb2snKX1jYXRjaChlcnJvcil7c3RhdHVzVGV4dChtZXNzYWdlLGVycm9yLm1lc3NhZ2V8fCdObyBzZSBwdWRvIGV4cG9ydGFyIGxhIGNvcGlhLicsJ2Vycm9yJyl9fTsKICAgIGZpbGVJbnB1dC5vbmNoYW5nZT1hc3luYygpPT57c2VsZWN0ZWRCYWNrdXA9bnVsbDtpbXBvcnRCdXR0b24uZGlzYWJsZWQ9dHJ1ZTtjb25zdCBmaWxlPWZpbGVJbnB1dC5maWxlcz8uWzBdO2lmKCFmaWxlKXJldHVybjtpZihmaWxlLnNpemU+TUFYX0JZVEVTKXtzdGF0dXNUZXh0KG1lc3NhZ2UsJ0xhIGNvcGlhIHN1cGVyYSBlbCBsw61taXRlIGRlIDI1IE1CLicsJ2Vycm9yJyk7ZmlsZUlucHV0LnZhbHVlPScnO3JldHVybn10cnl7c2VsZWN0ZWRCYWNrdXA9SlNPTi5wYXJzZShhd2FpdCBmaWxlLnRleHQoKSk7aWYoIXNlbGVjdGVkQmFja3VwPy5kYXRhfHxzZWxlY3RlZEJhY2t1cC5mb3JtYXQhPT0nRlZNYXJrZXQgZGF0YWJhc2UgYmFja3VwJyl7dGhyb3cgRXJyb3IoJ1NlbGVjY2lvbmEgdW5hIGNvcGlhIGV4cG9ydGFkYSBwb3IgRlZNYXJrZXQuJyl9aW1wb3J0QnV0dG9uLmRpc2FibGVkPWZhbHNlO3N0YXR1c1RleHQobWVzc2FnZSxgQ29waWEgcHJlcGFyYWRhOiAke2ZpbGUubmFtZX0uIEHDum4gbm8gc2UgaGEgaW1wb3J0YWRvLmAsJ29rJyl9Y2F0Y2goZXJyb3Ipe2ZpbGVJbnB1dC52YWx1ZT0nJztzdGF0dXNUZXh0KG1lc3NhZ2UsZXJyb3IubWVzc2FnZXx8J0VsIGFyY2hpdm8gbm8gY29udGllbmUgSlNPTiB2w6FsaWRvLicsJ2Vycm9yJyl9fTsKICAgIGltcG9ydEJ1dHRvbi5vbmNsaWNrPWFzeW5jKCk9PntpZighc2VsZWN0ZWRCYWNrdXApcmV0dXJuO2lmKCFjb25maXJtKCdMYSBpbXBvcnRhY2nDs24gcmVlbXBsYXphcsOhIGxvcyBkYXRvcyBhY3R1YWxlcy4gwr9EZXNlYXMgY29udGludWFyPycpKXJldHVybjtpZihwcm9tcHQoJ0VzY3JpYmUgSU1QT1JUQVIgcGFyYSBjb25maXJtYXIgbGEgcmVzdGF1cmFjacOzbjonKSE9PSdJTVBPUlRBUicpcmV0dXJuO3RyeXtpbXBvcnRCdXR0b24uZGlzYWJsZWQ9dHJ1ZTtzdGF0dXNUZXh0KG1lc3NhZ2UsJ0ltcG9ydGFuZG8gY29waWHigKYnKTtjb25zdCByZXN1bHQ9YXdhaXQgYXBpKCcvYXBpL2FkbWluL2RhdGFiYXNlL2ltcG9ydCcse21ldGhvZDonUE9TVCcsYm9keTpKU09OLnN0cmluZ2lmeSh7YmFja3VwOnNlbGVjdGVkQmFja3VwfSl9KTtzdGF0dXNUZXh0KG1lc3NhZ2UscmVzdWx0Lm1lc3NhZ2V8fCdDb3BpYSBpbXBvcnRhZGEgY29ycmVjdGFtZW50ZS4nLCdvaycpO3NldFRpbWVvdXQoKCk9PmxvY2F0aW9uLnJlbG9hZCgpLDcwMCl9Y2F0Y2goZXJyb3Ipe2ltcG9ydEJ1dHRvbi5kaXNhYmxlZD1mYWxzZTtzdGF0dXNUZXh0KG1lc3NhZ2UsZXJyb3IubWVzc2FnZXx8J05vIHNlIHB1ZG8gaW1wb3J0YXIgbGEgY29waWEuJywnZXJyb3InKX19OwogICAgY2FyZC5xdWVyeVNlbGVjdG9yKCcjZnZtRGJSZXNldCcpLm9uY2xpY2s9YXN5bmMoKT0+e2lmKCFjb25maXJtKCdFc3RvIGVsaW1pbmFyw6EgbG9zIGRhdG9zIG9wZXJhdGl2b3MgZGUgRlZNYXJrZXQgeSByZXN0YXVyYXLDoSBlbCBlc3RhZG8gaW5pY2lhbC4gwr9EZXNlYXMgY29udGludWFyPycpKXJldHVybjtpZihwcm9tcHQoJ0VzY3JpYmUgUkVJTklDSUFSIHBhcmEgY29uZmlybWFyIGVsIHJlaW5pY2lvOicpIT09J1JFSU5JQ0lBUicpcmV0dXJuO3RyeXtzdGF0dXNUZXh0KG1lc3NhZ2UsJ1JlaW5pY2lhbmRvIGJhc2UgZGUgZGF0b3PigKYnKTtjb25zdCByZXN1bHQ9YXdhaXQgYXBpKCcvYXBpL2FkbWluL2RhdGFiYXNlL3Jlc2V0Jyx7bWV0aG9kOidQT1NUJyxib2R5OkpTT04uc3RyaW5naWZ5KHtjb25maXJtYXRpb246J1JFSU5JQ0lBUid9KX0pO3N0YXR1c1RleHQobWVzc2FnZSxyZXN1bHQubWVzc2FnZXx8J0Jhc2UgZGUgZGF0b3MgcmVpbmljaWFkYS4nLCdvaycpO3NldFRpbWVvdXQoKCk9PmxvY2F0aW9uLnJlbG9hZCgpLDcwMCl9Y2F0Y2goZXJyb3Ipe3N0YXR1c1RleHQobWVzc2FnZSxlcnJvci5tZXNzYWdlfHwnTm8gc2UgcHVkbyByZWluaWNpYXIgbGEgYmFzZSBkZSBkYXRvcy4nLCdlcnJvcicpfX07CiAgICBnZXRTdGF0dXMoKTsKICB9OwogIGlmKGRvY3VtZW50LnJlYWR5U3RhdGU9PT0nbG9hZGluZycpZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsbW91bnQpO2Vsc2Ugc2V0VGltZW91dChtb3VudCwwKTsKfSkoKTsK',
}


def replace_once(path, old, new, label):
    source = path.read_text(encoding='utf-8')
    if new in source:
        return
    if old not in source:
        raise SystemExit(f'No se encontró el bloque esperado: {label}')
    path.write_text(source.replace(old, new, 1), encoding='utf-8')


def insert_before(path, marker, block, label):
    source = path.read_text(encoding='utf-8')
    if block in source:
        return
    if marker not in source:
        raise SystemExit(f'No se encontró el punto de inserción: {label}')
    path.write_text(source.replace(marker, block + marker, 1), encoding='utf-8')


# Sustituye solo la cabecera duplicada del catálogo y su buscador secundario.
index_source = INDEX.read_text(encoding='utf-8')
if 'Productos destacados' in index_source:
    result, count = re.subn(
        r'(<section class="site-section site-catalog-section" id="catalogo"><span id="productos"></span><span id="ofertas"></span>).*?(<div class="site-product-grid site-container" id="productGrid">)',
        r'\1\2',
        index_source,
        count=1,
        flags=re.DOTALL,
    )
    if count != 1:
        raise SystemExit('No se encontró la cabecera duplicada del catálogo.')
    INDEX.write_text(result, encoding='utf-8')

replace_once(
    INDEX,
    "function clearCatalogSearch(){const input=document.getElementById('siteCatalogSearch');if(input)input.value='';const clear=document.getElementById('siteCatalogClear');if(clear)clear.style.display='none';loadProducts();document.getElementById('siteCatalogStatus').textContent='Disponibilidad a consultar'}",
    "function clearCatalogSearch(){const input=document.getElementById('siteCatalogSearch');if(input)input.value='';const clear=document.getElementById('siteCatalogClear');if(clear)clear.style.display='none';loadProducts();const status=document.getElementById('siteCatalogStatus');if(status)status.textContent='Disponibilidad a consultar'}",
    'limpieza de filtros sin buscador secundario',
)

# Mantenimiento de base de datos: rutas solo de administrador y escritura
# sincronizada para que un reinicio o una restauración no deje dos estados distintos.
replace_once(
    SERVER,
    "const persistence = require('./persistent_store_v17');",
    "const persistence = require('./persistent_store_v17');\nconst databaseBackup = require('./database_backup_v1');",
    'módulo de copias',
)
replace_once(
    SERVER,
    "function save(d){fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2));persistence.persist(d)}\nfunction ensureAdmin(d){",
    "function save(d){fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2));persistence.persist(d)}\nfunction normalizeState(d){\n  const before=JSON.stringify(d);\n  ensureAdmin(d);ensureCatalogData(d);ensureCatalogProducts(d);\n  ensureCustomerData(d);ensureBillingData(d);ensureCatalogSettings(d);ensureWarehouseData(d);ensureLogisticsSettings(d);operations.ensureOperationsData(d);procurementV2.ensureData(d);\n  return JSON.stringify(d)!==before;\n}\nfunction writeStateAtomically(raw){const temporary=DATA_FILE+'.next';fs.writeFileSync(temporary,raw);fs.renameSync(temporary,DATA_FILE)}\nasync function replaceState(d){\n  const raw=JSON.stringify(d,null,2),previous=fs.existsSync(DATA_FILE)?fs.readFileSync(DATA_FILE,'utf8'):'';\n  writeStateAtomically(raw);\n  try{await persistence.replace(raw)}catch(error){try{if(previous)writeStateAtomically(previous)}catch(rollbackError){console.error('FVMarket database rollback failed:',rollbackError.message)}throw error;}\n  return d;\n}\nfunction ensureAdmin(d){",
    'normalización y escritura atómica',
)
old_read = """function read(){
  try{
    const d=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    const before=JSON.stringify(d);
    const changedAdmin=ensureAdmin(d);
    const changedCatalogData=ensureCatalogData(d);
    const changedCatalog=ensureCatalogProducts(d);
    ensureCustomerData(d);ensureBillingData(d);ensureCatalogSettings(d);ensureWarehouseData(d);ensureLogisticsSettings(d);operations.ensureOperationsData(d);procurementV2.ensureData(d);
    if(changedAdmin||changedCatalogData||changedCatalog||JSON.stringify(d)!==before)save(d);
    return d;
  }catch(e){
    const d=seed();ensureAdmin(d);ensureCatalogData(d);ensureCustomerData(d);ensureBillingData(d);ensureCatalogSettings(d);ensureWarehouseData(d);ensureLogisticsSettings(d);operations.ensureOperationsData(d);procurementV2.ensureData(d);save(d);return d;
  }
}"""
new_read = """function read(){
  try{
    const d=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    if(normalizeState(d))save(d);
    return d;
  }catch(e){
    const d=seed();normalizeState(d);save(d);return d;
  }
}"""
replace_once(SERVER, old_read, new_read, 'lectura normalizada')
database_routes = """app.get('/api/admin/database/export',admin,(req,res)=>{
  const backup=databaseBackup.createBackup(read());
  const stamp=backup.exportedAt.replace(/[:.]/g,'-');
  res.set('Content-Disposition',`attachment; filename=\"fvmarket-backup-${stamp}.json\"`);
  res.type('application/json').send(JSON.stringify(backup,null,2));
});
app.post('/api/admin/database/import',admin,async(req,res)=>{
  try{
    const current=read();
    const imported=databaseBackup.preserveAdministrators(databaseBackup.parseBackup(req.body?.backup),current.users);
    normalizeState(imported);await replaceState(imported);
    res.json({ok:true,message:'Copia importada correctamente. Las cuentas administradoras existentes se han mantenido.'});
  }catch(error){res.status(400).json({error:error.message||'No se pudo importar la copia.'})}
});
app.post('/api/admin/database/reset',admin,async(req,res)=>{
  if(String(req.body?.confirmation||'').trim()!=='REINICIAR')return res.status(400).json({error:'Confirma el reinicio escribiendo REINICIAR.'});
  try{
    const current=read();
    const fresh=databaseBackup.initialState(seed(),current.users);
    normalizeState(fresh);await replaceState(fresh);
    res.json({ok:true,message:'La base de datos se ha reiniciado. Se han mantenido las cuentas administradoras.'});
  }catch(error){res.status(500).json({error:error.message||'No se pudo reiniciar la base de datos.'})}
});
"""
insert_before(SERVER, "app.get('/api/admin/invoices',ordersManager", database_routes, 'rutas de copias')

replace_once(
    ADMIN,
    '<script src="/fvmarket-admin-control-v2.js?v=2"></script>',
    '<script src="/fvmarket-admin-control-v2.js?v=2"></script>\n<script src="/fvmarket-admin-database-v1.js?v=1"></script>',
    'script de mantenimiento',
)
replace_once(
    ADMIN,
    '.fvmRouteBox{background:#edf6ff;border:1px solid #cfe0ef;border-radius:10px;padding:12px;margin-top:12px;font-size:11px}',
    '.fvmRouteBox{background:#edf6ff;border:1px solid #cfe0ef;border-radius:10px;padding:12px;margin-top:12px;font-size:11px}\n.fvmDbHead{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}.fvmDbHead h2{margin:0}.fvmDbHead .sub{margin:5px 0 0}.fvmDbActions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.fvmDbDanger{margin-top:16px;padding:13px;border:1px solid #f2b9b9;border-radius:10px;background:#fff7f7}.fvmDbDanger h3{margin:0 0 5px;color:#a91d1d}.fvmDbDanger p{margin:0 0 12px;font-size:12px;color:#6d3030}.fvmDbDanger .danger{background:#a91d1d;color:#fff;border-color:#a91d1d}@media(max-width:620px){.fvmDbHead{display:block}.fvmDbHead .badge{display:inline-block;margin-top:10px}}',
    'estilos de mantenimiento',
)

replace_once(
    TESTS,
    "const emails = require('../transactional_emails');",
    "const emails = require('../transactional_emails');\nconst databaseBackup = require('../database_backup_v1');",
    'módulo de pruebas de copias',
)
replace_once(
    TESTS,
    '  assert.match(index, /Klarna y otros métodos disponibles para tu compra/);',
    "  assert.match(index, /Klarna y otros métodos disponibles para tu compra/);\n  assert.doesNotMatch(index, /Productos destacados/);\n  assert.doesNotMatch(index, /Buscar por producto o referencia/);\n  assert.match(index, /Buscar productos, marcas o referencias/);",
    'prueba de catálogo sin cabecera duplicada',
)
backup_test = """
test('las copias de seguridad comprueban su integridad y conservan los administradores', () => {
  const state = fixture();
  state.users = [{ id: 'admin-actual', role: 'admin', username: 'admin', password: 'hash' }, { id: 'customer', role: 'customer' }];
  const backup = databaseBackup.createBackup(state, '2026-09-27T12:00:00.000Z');
  const restored = databaseBackup.parseBackup(backup);
  assert.equal(restored.products[0].id, 'p1');
  restored.users = [];
  const protectedState = databaseBackup.preserveAdministrators(restored, state.users);
  assert.deepEqual(protectedState.users.map(user => user.id), ['admin-actual']);
  assert.throws(() => databaseBackup.parseBackup({ ...backup, checksum: '0'.repeat(64) }), /integridad/i);
});
"""
if backup_test not in TESTS.read_text(encoding='utf-8'):
    with TESTS.open('a', encoding='utf-8') as file:
        file.write(backup_test)

for path, encoded in FILES_B64.items():
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(base64.b64decode(encoded))

archive = io.BytesIO()
with tarfile.open(fileobj=archive, mode='w:gz') as tar:
    for file in sorted(ROOT.rglob('*')):
        if file.is_file():
            tar.add(file, arcname=str(file.relative_to(ROOT)))
Path('fvmarket-app.tgz.b64').write_text(base64.b64encode(archive.getvalue()).decode('ascii'), encoding='ascii')
print('FVMarket: mantenimiento de base de datos y catálogo simplificado aplicados')
